/** Serve authenticated transcript search data, or redirect browser visits to the native React search page. */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Request with optional q text and agent filter; Accept application/json selects data. */
    req: Request;
    /** HTTP route parameters, unused. */
    params: Record<string, string>;
}) {
    const headers = { 'cache-control': 'no-store', vary: 'Accept' };
    if (!(session as Session & { user?: { id: string } })?.user) return Response.json({error:'Unauthorized'}, {status:401, headers});
    const url = new URL(opts.req.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    const agentId = url.searchParams.get('agent') || undefined;
    if (!opts.req.headers.get('accept')?.includes('application/json')) {
        const query = new URLSearchParams({view:'extension:documentation/search'});
        if(q) query.set('q',q);
        if(agentId) query.set('agent',agentId);
        return new Response(null,{status:303,headers:{...headers,location:`/?${query}`}});
    }
    // Keep the existing signed-in, shared transcript search policy and BM25 semantics.
    const hits = q ? await ctx.fns.session.searchBm25({q,agentId,limit:30}) : [];
    return Response.json({q,agentId:agentId ?? null,hits},{headers});
}
