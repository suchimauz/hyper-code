/** Serve canonical facts, evidence, relations and change history to React, or redirect legacy detail navigation. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming authenticated HTTP request. */ req: Request;
    /** Canonical entity type and slug. */ params: { type: string; slug: string };
}) {
    if (!_session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const url = new URL(opts.req.url), { type, slug } = opts.params;
    if (url.searchParams.get('format') !== 'json') {
        url.pathname = '/'; url.searchParams.set('view', 'extension:knowledge/overview'); url.searchParams.set('type', type); url.searchParams.set('slug', slug);
        return Response.redirect(url.toString(), 302);
    }
    const id = `${type}/${slug}`, entity = await ctx.fns.knowledge.get({ id });
    if (!entity) return Response.json({ error: 'Knowledge entity not found' }, { status: 404 });
    const history = await ctx.fns.procs.db.select({ sql: 'SELECT id, attribute, operation, before_value, after_value, source_agent_id, source_message_idx, evidence, changed_at FROM knowledge.entity_changes WHERE subject = ? ORDER BY changed_at DESC, id DESC LIMIT ?', params: [id, 31] });
    return Response.json({ entity, history: history.slice(0, 30), hasMore: history.length > 30 }, { headers: { 'Cache-Control': 'no-store' } });
}
