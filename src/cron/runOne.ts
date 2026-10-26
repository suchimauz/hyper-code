/**
 * Executes one claimed cron run and advances its task schedule.
 * @param opts.id Running cron run identifier.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Running cron run identifier. */ id: number;
}): Promise<{ id: number; name: string; status: string; ms: number }> {
    const state = ((ctx.state as any).cron ??= {});
    const authorized = !!_session && state.runCapabilities?.get(_session) === opts.id;
    if (_session && !authorized) throw new Error("cron.runOne requires a worker capability; direct legacy calls must have no session");
    if (authorized) state.runCapabilities.delete(_session);
    const rows = await ctx.fns.procs.db.select({ sql: "SELECT * FROM cron_runs WHERE id=? AND status='running'", params: [opts.id] });
    const run: any = rows[0]; if (!run) throw new Error(`cron.runOne: running run ${opts.id} not found`);
    const serviceSession = Object.freeze({ kind: "cron-service" });
    const derived = Object.create(ctx); derived.session = serviceSession;
    const services = (state.notificationServices ??= new WeakMap());
    const inferenceServices = (state.inferenceServices ??= new WeakMap());
    if (authorized) {
        const grants = await ctx.fns.procs.db.select({sql: `SELECT g.* FROM cron_grants g JOIN cron_tasks t ON t.name=g.task_name
            WHERE g.task_name=? AND g.target_fn=? AND g.definition_version=?
            AND t.fn=g.target_fn AND t.authority_version=g.definition_version`, params:[run.task_name,run.fn,run.authority_version]});
        const grant = grants[0];
        const scopes = typeof grant?.scopes === "string" ? JSON.parse(grant.scopes) : grant?.scopes;
        if (grant && Array.isArray(scopes)) {
            const names = scopes.filter(s => typeof s === "string");
            const value = Object.freeze({ownerId:String(grant.owner_id),scopes:Object.freeze(names),runId:Number(run.id),taskName:String(run.task_name),targetFn:String(run.fn),definitionVersion:Number(run.authority_version),storedScopes:JSON.stringify(scopes),transportActor:`cron:${run.task_name}:${run.id}`});
            if (names.includes("notification.enqueue")) services.set(serviceSession, value);
            const descriptor = scopes.find(s => s && typeof s === "object" && s.inference)?.inference;
            if (names.includes("llm.ssh-inference") && descriptor) inferenceServices.set(serviceSession, Object.freeze({...value,inference:Object.freeze({...descriptor})}));
        }
    }
    let target: any = derived.fns; for (const segment of String(run.fn).split(".")) target = target?.[segment];
    const started = Date.now(); let status = "done", result: any = null, error: string | null = null;
    try { if (typeof target !== "function") throw new Error(`unknown runtime function: ${run.fn}`); result = await target(typeof run.args === "string" ? JSON.parse(run.args) : (run.args ?? {})); }
    catch (cause: any) { status = "error"; error = String(cause?.stack ?? cause?.message ?? cause).slice(0, 16000); }
    finally { services.delete(serviceSession); inferenceServices.delete(serviceSession); }
    let resultJson = "null"; try { const json=JSON.stringify(result ?? null); resultJson=json.length<=8192?json:JSON.stringify({truncated:true,bytes:json.length}); } catch { resultJson=JSON.stringify({unserializable:true}); }
    const finished = Date.now();
    await ctx.fns.procs.db.run({ sql: "UPDATE cron_runs SET status=?, result=?::jsonb, error=?, finished_at=? WHERE id=?", params: [status, resultJson, error, finished, run.id] });
    await ctx.fns.procs.db.run({
        sql: `UPDATE cron_tasks SET state='idle',
                 next_run_at=CASE WHEN enabled AND schedule_type='interval' AND every_ms IS NOT NULL THEN ? + every_ms ELSE NULL END,
                 enabled=CASE WHEN schedule_type='once' THEN FALSE ELSE enabled END,
                 updated_at=? WHERE name=?`,
        params: [finished, finished, run.task_name],
    });
    ctx.fns.cron.wakeWorker({}); return { id:Number(run.id), name:String(run.task_name), status, ms:finished-started };
}
