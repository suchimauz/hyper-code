/** Browse received, sent and quarantined mail with authenticated JSON or the React reader.
 * @param opts.req Request; Accept application/json selects read-only JSON.
 * @param opts.params Decoded path parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const headers = { 'cache-control': 'no-store', vary: 'Accept' };
    if (!(session as Session & { user?: { id: string } })?.user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
    const url = new URL(opts.req.url);
    const view = (['in', 'out', 'quarantine'] as const).find(v => v === url.searchParams.get('view')) ?? 'in';
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    if (!opts.req.headers.get('accept')?.includes('application/json')) {
        const query = new URLSearchParams({ view: 'extension:readers/inbox' });
        query.set('mailView', view);
        if (q) query.set('q', q);
        return new Response(null, { status: 303, headers: { ...headers, location: '/?' + query } });
    }
    const status = await ctx.fns.inbox.status({});
    const rows = view === 'quarantine' ? await ctx.fns.inbox.list({ quarantined: true, limit: 200 })
        : (await ctx.fns.inbox.list({ direction: view, limit: 200 })).filter(m => view === 'out' || m.verified);
    const messages = rows.filter(m => !q || [m.from, ...m.to, m.subject ?? '', m.text].join(' ').toLowerCase().includes(q));
    return Response.json({ view, q, status, messages }, { headers });
}
