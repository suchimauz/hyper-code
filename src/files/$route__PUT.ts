/** Save existing editable Files text with cookie-bound CSRF and an optimistic content check. */
export default async function (ctx: Context, _session: Session | null, opts: { /** Incoming authenticated JSON request. */ req: Request; /** Route parameters. */ params: Record<string, string> }): Promise<Response> {
    const who=await ctx.fns.auth.currentUser({req:opts.req});
    if(who.required&&!who.user&&!who.legacy) return new Response('Authentication required',{status:401});
    if(!await ctx.fns.auth.verifyCsrf({req:opts.req,token:opts.req.headers.get('x-csrf-token')??''})) return new Response('Invalid CSRF token',{status:403});
    const url=new URL(opts.req.url),path=url.searchParams.get('path')??'',host=url.searchParams.get('host')||undefined;
    if(!path || (host&&!path.startsWith('/'))) return new Response('Absolute path required',{status:400});
    if(host&&!(await ctx.fns.remote.servers({})).some(s=>s.name===host)) return new Response('Unknown host',{status:400});
    if(await ctx.fns.files.isPrivateResult({path,host})) return new Response('File unavailable',{status:404});
    const body=await opts.req.json().catch(()=>null);
    if(typeof body?.content!=='string'||body.content.length>1024*1024||typeof body.expectedContent!=='string') return new Response('Invalid text content',{status:400});
    try {
        const response=await ctx.fns.files.browserData({path,host});
        if(!response.ok) return response;
        const data=await response.json();
        if(typeof data.content!=='string') return new Response('File is not editable text',{status:400});
        if(data.content!==body.expectedContent) return new Response('File changed on disk; reload before saving',{status:409});
        await ctx.fns.files.write({path,host,content:body.content,expectedContent:data.content});
        return Response.json({...data,content:body.content},{headers:{'cache-control':'no-store'}});
    } catch { return new Response('File could not be saved',{status:400}); }
}
