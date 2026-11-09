/** Read a mirrored Substack publication with authenticated JSON or the React reader.
 * @param opts.req Request; Accept application/json selects read-only JSON.
 * @param opts.params Decoded path parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const headers = { 'cache-control': 'no-store', vary: 'Accept' };
    if (!(session as Session & { user?: { id: string } })?.user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
    const url = new URL(opts.req.url);
    const key = opts.params.key!;
    if (!opts.req.headers.get('accept')?.includes('application/json')) {
        const query = new URLSearchParams({ view: 'extension:readers/substack' });
        query.set('key', key);
        return new Response(null, { status: 303, headers: { ...headers, location: '/?' + query } });
    }
    const publication = (await ctx.fns.substack.list({})).find(p => p.key === key);
    if (!publication) return Response.json({ error: 'Publication not found' }, { status: 404, headers });
    return Response.json({ publication, posts: await ctx.fns.substack.posts({ key, limit: 100 }) }, { headers });
}
