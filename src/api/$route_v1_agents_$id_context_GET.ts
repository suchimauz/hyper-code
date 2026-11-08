/** Return the next-request context estimate for the authenticated chat's footer meter.
 * Uses the same preview calculation as the main Hyper context ring; never substitutes stale provider usage.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming authenticated HTTP request. */ req: Request;
    /** Route parameters containing the agent id. */ params: Record<string, string>;
}) {
    const id = opts.params.id!;
    const rows = await ctx.fns.procs.db.select({ sql: 'SELECT id FROM agents WHERE id = ?', params: [id] });
    if (!rows.length) return Response.json({ error: 'not_found' }, { status: 404 });
    try {
        const { breakdown, ...budget } = await ctx.fns.agent.contextBudget({ agentId: id, breakdown: true });
        // Optional details must not take the existing budget meter down.
        let details: types.agent.ContextDetails | null = null;
        try {
            details = await ctx.fns.agent.contextDetails({ agentId: id });
            details.breakdown = breakdown ?? null;
        } catch (error) {
            console.warn('Context details unavailable', id, error instanceof Error ? error.message : String(error));
        }
        return Response.json({ budget, details }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.warn('Context estimate unavailable', id, error instanceof Error ? error.message : String(error));
        return Response.json({ budget: null, details: null }, { headers: { 'Cache-Control': 'no-store' } });
    }
}
