/** Stream an authenticated local or remote Files preview with active content sandboxed. */
export default async function (ctx: Context, _session: Session | null, opts: { /** Incoming preview or download request. */ req: Request }): Promise<Response> {
    const who=await ctx.fns.auth.currentUser({req:opts.req});
    if(who.required&&!who.user&&!who.legacy) return new Response('Authentication required',{status:401});
    const url=new URL(opts.req.url),path=url.searchParams.get('path')??'',host=url.searchParams.get('host')||undefined;
    if(host&&!(await ctx.fns.remote.servers({})).some(s=>s.name===host)) return new Response('Unknown host',{status:400});
    const response=await ctx.fns.files.rawResponse({path,host,method:opts.req.method});
    response.headers.set('content-security-policy',"sandbox; default-src 'none'; img-src data: blob: 'self'; media-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
    response.headers.set('referrer-policy','no-referrer');
    if(url.searchParams.get('download')==='1') response.headers.set('content-disposition','attachment');
    return response;
}
