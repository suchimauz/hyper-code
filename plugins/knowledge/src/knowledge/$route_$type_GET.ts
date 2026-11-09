/** Serve a bounded entity list to React or redirect legacy type navigation. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming authenticated HTTP request. */ req: Request;
    /** Canonical entity type. */ params: { type: string };
}) {
    if (!_session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const url = new URL(opts.req.url), type = opts.params.type;
    if (url.searchParams.get('format') !== 'json') {
        url.pathname = '/'; url.searchParams.set('view', 'extension:knowledge/overview'); url.searchParams.set('type', type);
        return Response.redirect(url.toString(), 302);
    }
    await ctx.fns.knowledge.ensure({});
    const rows = await ctx.fns.procs.db.select({ sql: "SELECT id,type,data,updated_at FROM knowledge.entities WHERE type=? ORDER BY coalesce(data->>'title',id) LIMIT 501", params: [type] });
    if (!rows.length && !(await ctx.fns.knowledge.types({})).some(item => item.type === type)) return Response.json({ error: 'Unknown knowledge type' }, { status: 404 });
    return Response.json({ rows: rows.slice(0, 500), hasMore: rows.length > 500 }, { headers: { 'Cache-Control': 'no-store' } });
}
