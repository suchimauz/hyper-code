/** Search an owned chat's complete persisted history; returns bounded plain-text previews.
 * @param opts.req Incoming request carrying literal query and optional numeric cursor.
 * @param opts.params Route parameters containing the conversation identifier.
 */
export default async function(ctx:Context, _session:Session|null, opts:{
    /** Incoming request carrying query and cursor. */ req:Request;
    /** Route parameters containing the conversation identifier. */ params:Record<string,string>;
}):Promise<Response>{
    const url=new URL(opts.req.url), query=url.searchParams.get('q')??'', raw=url.searchParams.get('after');
    const after=raw===null?-1:Number(raw);
    const headers={'cache-control':'no-store'};
    if(!query.trim()||query.length>200||query.includes(String.fromCharCode(0))||!Number.isSafeInteger(after)||after< -1) return Response.json({error:'Invalid search parameters'},{status:400,headers});
    try {
        const data=await ctx.fns.chat.searchHistory({agentId:opts.params.id??'',query,after});
        return Response.json(data,{headers});
    } catch(error) {
        console.warn('chat search unavailable', error instanceof Error?error.message:'unknown error');
        return Response.json({error:'Search unavailable for this conversation'},{status:403,headers});
    }
}
