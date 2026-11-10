/**
 * Serve authorized fixed Git Canvas read operations and workspace-bound tab opening.
 *
 * Checks Canvas agent ownership for every request, verifies CSRF for tab creation, and derives read targets only from an owned open gitUi.repository item. Browser callers cannot supply repository paths, hosts, argv or arbitrary refs.
 * @param opts.req Incoming same-origin JSON transport request.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming same-origin JSON transport request. */
        req: Request;
    },
): Promise<Response> {
    const url=new URL(opts.req.url),agentId=url.searchParams.get('agentId')||'';
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(agentId))return new Response('Invalid agent',{status:400});
    const denied=await ctx.fns.canvas.authorizeHttp({req:opts.req,agentId});if(denied)return denied;
    try {
     if(opts.req.method==='POST'){
      if(!(await ctx.fns.auth.verifyCsrf({req:opts.req,token:opts.req.headers.get('x-csrf-token')||''})))return new Response('Invalid CSRF token',{status:403});
      return Response.json(await ctx.fns.canvas.show({agentId,kind:'gitUi.repository',args:{}}));
     }
     if(opts.req.method!=='GET')return new Response('Method not allowed',{status:405});
     const itemId=Number(url.searchParams.get('itemId'));
     const item=(await ctx.fns.canvas.list({agentId})).find(i=>i.id===itemId&&i.kind==='gitUi.repository');
     if(!item)return new Response('Unknown Git tab',{status:404});
     const dir=String(item.args.dir),host=String(item.args.host),op=url.searchParams.get('op')||'snapshot';
     let data:object;
     if(op==='snapshot')data=await ctx.fns.gitUi.snapshot({dir,host,page:Number(url.searchParams.get('page')||0),anchor:url.searchParams.get('anchor')||undefined});
     else if(op==='commit')data=await ctx.fns.gitUi.commit({dir,host,hash:url.searchParams.get('hash')||''});
     else if(op==='diff')data=await ctx.fns.gitUi.diff({dir,host,path:url.searchParams.get('path')||'',group:url.searchParams.get('group')||'',hash:url.searchParams.get('hash')||undefined});
     else return new Response('Unsupported read operation',{status:400});
     return Response.json(data,{headers:{'Cache-Control':'no-store'}});
    } catch(error) {return Response.json({error:error instanceof Error?error.message:String(error)},{status:400,headers:{'Cache-Control':'no-store'}});}
}
