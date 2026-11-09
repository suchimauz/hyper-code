/** Browse the local Hacker News mirror with authenticated JSON or the React reader.
 * @param opts.req Request; Accept application/json selects read-only JSON.
 * @param opts.params Decoded path parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const headers = { 'cache-control': 'no-store', vary: 'Accept' };
    if (!(session as Session & { user?: { id: string } })?.user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
    const url = new URL(opts.req.url);
    const feed = url.searchParams.get('feed') ?? 'front';
    if (!opts.req.headers.get('accept')?.includes('application/json')) {
        const query = new URLSearchParams({ view: 'extension:readers/hackernews' });
        query.set('feed', feed);
        return new Response(null, { status: 303, headers: { ...headers, location: '/?' + query } });
    }
    const feeds = await ctx.fns.hackernews.listFeeds({});
    const stories = await ctx.fns.hackernews.stories({ feed, limit: 100 });
    return Response.json({ feed, feeds, stories }, { headers });
}
