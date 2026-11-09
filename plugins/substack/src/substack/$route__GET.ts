/** Browse mirrored Substack publications with authenticated JSON or the React reader.
 * @param opts.req Request; Accept application/json selects read-only JSON.
 * @param opts.params Decoded path parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const headers = { 'cache-control': 'no-store', vary: 'Accept' };
    if (!(session as Session & { user?: { id: string } })?.user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
    const url = new URL(opts.req.url);
    if (!opts.req.headers.get('accept')?.includes('application/json')) {
        const query = new URLSearchParams({ view: 'extension:readers/substack' });

        return new Response(null, { status: 303, headers: { ...headers, location: '/?' + query } });
    }
    return Response.json({ publications: await ctx.fns.substack.list({}) }, { headers });
}
