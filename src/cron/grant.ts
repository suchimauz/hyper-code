/**
 * Registers a scoped cron grant for an authenticated HTTP owner
 *
 * Call during owner HTTP activation after registering a task. Binds notification delivery permission to the current task definition and authenticated owner, never to task arguments. Other owners cannot replace an existing grant.
 * @param opts.name Existing cron task name owned by this registration.
 * @param opts.fn Expected runtime function; must exist and match the stored task.
 * @param opts.scopes Explicit notification.enqueue and/or llm.ssh-inference capabilities.
 * @param opts.inference Exact OpenCode Go DeepSeek transport descriptor; required only for llm.ssh-inference.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Existing cron task name owned by this registration. */
        name: string;
        /** Expected runtime function; must exist and match the stored task. */
        fn: string;
        /** Explicit notification.enqueue and/or llm.ssh-inference capabilities. */
        scopes: string[];
        /** Exact OpenCode Go descriptor; model must be deepseek-v4.1-flash. Required for inference; changes require owner HTTP approval. */
        inference?: { provider: "opencode"; instance: string; account: "default"; model: string };
    },
): Promise<{ name: string; fn: string; ownerId: string; definitionVersion: number; scopes: string[] }> {
    if (!session || !(session.req instanceof Request) || session.agent || session.agentId || session.kind === "agent") throw new Error("cron.grant requires an authenticated owner HTTP request");
    const identity = await ctx.fns.auth.currentUser({req: session.req});
    if (!identity.user?.id) throw new Error("cron.grant requires an explicit authenticated owner");
    const ownerId = identity.user.id;
    if (!Array.isArray(opts.scopes) || !opts.scopes.length || new Set(opts.scopes).size !== opts.scopes.length || opts.scopes.some(s => !["notification.enqueue", "llm.ssh-inference"].includes(s))) throw new Error("cron.grant unsupported scope");
    const inference = opts.inference;
    if (opts.scopes.includes("llm.ssh-inference")) {
        if (identity.user.role !== "owner") throw new Error("cron inference grant requires an authenticated owner");
        if (!inference || Object.keys(inference).sort().join(",") !== "account,instance,model,provider" || inference.provider !== "opencode" || inference.account !== "default" || inference.model !== "deepseek-v4.1-flash" || typeof inference.instance !== "string" || !inference.instance.trim() || inference.instance !== inference.instance.trim()) throw new Error("cron.grant invalid inference descriptor");
    } else if (inference !== undefined) throw new Error("cron.grant inference requires llm.ssh-inference scope");
    const storedScopes = inference ? [...opts.scopes, { inference: { ...inference } }] : [...opts.scopes];
    let target: any = ctx.fns; for (const part of opts.fn.split(".")) target = target?.[part];
    if (typeof target !== "function") throw new Error("cron.grant target function not found");
    const rows = await ctx.fns.procs.db.select({sql: "INSERT INTO cron_grants(task_name,target_fn,definition_version,owner_id,scopes,created_at) SELECT name,fn,authority_version,?,?::jsonb,? FROM cron_tasks WHERE name=? AND fn=? ON CONFLICT(task_name) DO UPDATE SET target_fn=excluded.target_fn,definition_version=excluded.definition_version,scopes=excluded.scopes,created_at=excluded.created_at WHERE cron_grants.owner_id=excluded.owner_id RETURNING definition_version",params:[ownerId,JSON.stringify(storedScopes),Date.now(),opts.name,opts.fn]});
    if (!rows.length) throw new Error("cron.grant task mismatch or owned by another user");
    return {name:opts.name,fn:opts.fn,ownerId,definitionVersion:Number(rows[0].definition_version),scopes:[...opts.scopes]};
}
