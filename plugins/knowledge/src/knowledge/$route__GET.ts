/** Serve Knowledge overview JSON to the React extension, or redirect legacy navigation. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming authenticated HTTP request. */ req: Request;
    /** Route parameters. */ params: Record<string, string>;
}) {
    if (!_session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const url = new URL(opts.req.url);
    if (url.searchParams.get('format') !== 'json') {
        url.pathname = '/'; url.searchParams.set('view', 'extension:knowledge/overview');
        return Response.redirect(url.toString(), 302);
    }
    const query = (url.searchParams.get('q') ?? '').trim(), type = url.searchParams.get('type') || undefined;
    const [stats, types, hits] = await Promise.all([ctx.fns.knowledge.stats({}), ctx.fns.knowledge.types({}), query ? ctx.fns.knowledge.find({ query, type, limit: 50 }) : Promise.resolve([])]);
    const agentId = url.searchParams.get('agent');
    const tracking = agentId ? (await ctx.fns.procs.db.select({ sql: "SELECT scratchpad->'knowledgeTrackingEnabled' AS enabled, scratchpad->'knowledgeSidecar' AS preview FROM agents WHERE id=?", params: [agentId] }))[0] ?? null : null;
    return Response.json({ stats, types, hits, tracking, csrfToken: await ctx.fns.auth.csrfToken({ req: opts.req }) }, { headers: { 'Cache-Control': 'no-store' } });
}
