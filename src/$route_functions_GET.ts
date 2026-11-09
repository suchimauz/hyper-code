/** Serve authenticated live runtime documentation as JSON, or redirect to the native React documentation page. */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Request with q and namespace filters; Accept application/json selects full documentation data. */
    req: Request;
    /** HTTP route parameters, unused. */
    params: Record<string,string>;
}) {
    const headers = {'cache-control':'no-store',vary:'Accept'};
    if (!(session as Session & {user?: {id:string}})?.user) return Response.json({error:'Unauthorized'},{status:401,headers});
    const url = new URL(opts.req.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    const namespace = (url.searchParams.get('namespace') ?? '').trim();
    if(!opts.req.headers.get('accept')?.includes('application/json')) {
        const query = new URLSearchParams({view:'extension:documentation/functions'});
        if(q) query.set('q',q);
        if(namespace) query.set('namespace',namespace);
        return new Response(null,{status:303,headers:{...headers,location:`/?${query}`}});
    }
    const compact = q ? await ctx.fns.runtime.docs.search({query:q,limit:50}) : ctx.fns.runtime.docs.list({namespace:namespace || undefined});
    const docs = compact.filter(item => !namespace || item.name === namespace || item.name.startsWith(namespace+'.')).map(item => ({...ctx.fns.runtime.docs.get({name:item.name}), ranking:item}));
    const namespaces = [...new Set(ctx.fns.runtime.docs.list({}).map(item=>item.name.split('.').slice(0,-1).join('.')))].filter(Boolean).sort();
    return Response.json({q,namespace,namespaces,docs},{headers});
}
