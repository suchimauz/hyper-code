/**
 * Apply exact live cron inference grants before shared SOCKS provider dispatch
 *
 * Private fixed OpenCode Go capability bridge. Rechecks run, task, grant, authority version, owner role, model and URL, then invokes account-scoped dispatch without returning derived owner context or SSH capabilities.
 * @param opts.ssh Exact provider descriptor required by live grant.
 * @param opts.url Fixed allowed inference or public catalogue URL.
 * @param opts.init Immutable request snapshot checked against grant.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact provider descriptor required by live grant. */
        ssh: {instance:string;provider:"codex"|"claude-code"|"kimi-coding"|"zai-coding"|"minimax-coding"|"opencode";account:string};
        /** Fixed allowed inference or public catalogue URL. */
        url: string;
        /** Immutable request snapshot checked against grant. */
        init: {method?:string;headers?:Record<string,string>;body?:string;signal?:AbortSignal};
    },
): Promise<Response> {
    opts={ssh:{...opts.ssh},url:opts.url,init:{...opts.init,headers:{...opts.init.headers}}};const service=session?(ctx.state as any).cron?.inferenceServices?.get(session):null;if(!service)throw Error('Live cron capability required');
            const checkService = async () => {
                if (!session || ((ctx as any).state as any).cron?.inferenceServices?.get(session) !== service) throw new Error("Expired cron inference capability");
                const d = service.inference;
                if (!d || d.provider !== "opencode" || d.account !== "default" || d.model !== "deepseek-v4.1-flash" || typeof d.instance !== "string" || !d.instance || opts.ssh.provider !== d.provider || opts.ssh.instance !== d.instance || opts.ssh.account !== d.account) throw new Error("Cron inference descriptor mismatch");
                const read = ["https://opencode.ai/inference/go/v1/models", "https://opencode.ai/v2/docs/console/go"].includes(opts.url);
                if (read) {
                    if (opts.init.method !== "GET" || opts.init.body !== undefined) throw new Error("Cron catalogue requires GET without body");
                } else {
                    if (opts.url !== "https://opencode.ai/inference/go/openai/v1/chat/completions" || opts.init.method !== "POST" || typeof opts.init.body !== "string") throw new Error("Cron inference endpoint denied");
                    const body = JSON.parse(opts.init.body);
                    if (!body || Array.isArray(body) || body.model !== d.model) throw new Error("Cron inference model mismatch");
                }
                const rows = await (ctx as any).fns.procs.db.select({sql:`SELECT g.scopes FROM cron_grants g JOIN cron_tasks t ON t.name=g.task_name JOIN cron_runs r ON r.id=?
                    WHERE g.task_name=? AND g.target_fn=? AND g.owner_id=? AND g.definition_version=?
                    AND t.fn=g.target_fn AND t.authority_version=g.definition_version AND t.enabled=TRUE
                    AND r.task_name=g.task_name AND r.fn=g.target_fn AND r.authority_version=g.definition_version AND r.status='running'`,
                    params:[service.runId,service.taskName,service.targetFn,service.ownerId,service.definitionVersion]});
                const scopes = typeof rows[0]?.scopes === "string" ? JSON.parse(rows[0].scopes) : rows[0]?.scopes;
                if (!scopes || JSON.stringify(scopes) !== service.storedScopes || ((ctx as any).state as any).cron?.inferenceServices?.get(session) !== service) throw new Error("Revoked cron inference grant");
            };
    
    await checkService();const owners=await ctx.fns.procs.db.select({sql:"SELECT id FROM public.users WHERE id=? AND role='owner'",params:[service.ownerId]});if(!owners.length)throw Error('Cron owner revoked');const bridge=Object.create(ctx);bridge.session={user:{id:service.ownerId,role:'owner'},kind:'internal'};return bridge.fns.sshProvider.dispatch(opts);
}
