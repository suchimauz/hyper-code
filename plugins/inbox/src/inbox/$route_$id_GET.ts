/** Read a stored message and thread without marking mail read or sending anything.
 * @param opts.req Request; Accept application/json selects read-only JSON.
 * @param opts.params Decoded path parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const headers = { 'cache-control': 'no-store', vary: 'Accept' };
    if (!(session as Session & { user?: { id: string } })?.user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
    const url = new URL(opts.req.url);
    const id = opts.params.id!;
    const direction = url.searchParams.get('direction') === 'out' ? 'out' : 'in';
    if (!opts.req.headers.get('accept')?.includes('application/json')) {
        const query = new URLSearchParams({ view: 'extension:readers/inbox' });
        query.set('id', id);
        query.set('direction', direction);
        return new Response(null, { status: 303, headers: { ...headers, location: '/?' + query } });
    }
    const rows = await ctx.fns.inbox.list({ thread: id, limit: 500 });
    const message = rows.find(m => m.id === id && m.direction === direction) ?? rows.find(m => m.id === id);
    if (!message) return Response.json({ error: 'Message not found' }, { status: 404, headers });
    const thread = message.thread ? await ctx.fns.inbox.list({ thread: message.thread, limit: 500 }) : rows;
    return Response.json({ message, thread }, { headers });
}
