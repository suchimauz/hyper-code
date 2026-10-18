/** Return quota usage of the providers the calling node client may use.
 * @param opts.req Incoming request. */
export default async function (ctx: Context, _session: Session | null, opts: { /** Incoming request. */ req: Request }): Promise<Response> {
    const auth = await ctx.fns.node.authorize({ req: opts.req });
    if (!auth.ok) return auth.response;
    const allow = new Set(auth.client.providers);
    // Only configured local credentials in the authenticated provider scope.
    // Share in-flight probes and throttle attempts too (failed probes must not loop).
    const accounts = (await ctx.fns.llm.listAccounts({})).filter(a => a.source !== "node" && (!allow.size || allow.has(a.provider)))
        .map(a => ({ provider: a.provider, account: a.account }));
    const state = ((ctx.state as any).nodeUsageProbes ??= new Map<string, { at: number; promise: Promise<unknown>; pending: boolean }>());
    const key = JSON.stringify(accounts.map(a => [a.provider, a.account]).sort());
    let probe = state.get(key);
    if (!probe || (!probe.pending && Date.now() - probe.at >= 60_000)) {
        const next = { at: Date.now(), promise: Promise.resolve() as Promise<unknown>, pending: true };
        next.promise = ctx.fns.llm.refreshUsage({ accounts, maxAgeMs: 60_000, timeoutMs: 2500 }).catch(() => undefined).finally(() => { next.pending = false; });
        probe = next;
        state.set(key, next);
    }
    // Bound export latency even if credential renewal takes longer than provider I/O.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([probe.promise, new Promise(resolve => { timer = setTimeout(resolve, 3500); })]); }
    finally { clearTimeout(timer); }
    const configured = new Set(accounts.map(a => JSON.stringify([a.provider, a.account])));
    const usage = (await ctx.fns.llm.usageOverview({ connectedOnly: true })).filter(u => configured.has(JSON.stringify([u.provider, u.account])))
        .map((u) => ({ provider: u.provider, account: u.account, usedPercent: u.usedPercent, resetsAt: u.resetsAt, planType: u.planType, parkedAgents: u.parkedAgents, updatedAt: u.updatedAt, windows: u.windows }));
    return Response.json({ usage }, { headers: { "cache-control": "no-store" } });
}
