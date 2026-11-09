/** Serve the native React Files document, or bounded JSON for its authenticated file browser. */
export default async function (ctx: Context, _session: Session | null, opts: { /** Incoming browser request. */ req: Request; /** Route parameters. */ params: Record<string, string> }): Promise<Response> {
    const who = await ctx.fns.auth.currentUser({req:opts.req});
    if (who.required && !who.user && !who.legacy) return new Response('Authentication required',{status:401});
    const url = new URL(opts.req.url);
    const host = url.searchParams.get('host') || undefined;
    if (host && !(await ctx.fns.remote.servers({})).some(s=>s.name===host)) return new Response('Unknown host',{status:400});
    if (url.searchParams.get('format') === 'session') return Response.json({csrfToken:await ctx.fns.auth.csrfToken({req:opts.req})},{headers:{'cache-control':'no-store','vary':'Cookie'}});
    let path = url.searchParams.get('path') || '';
    if (host && !path.startsWith('/')) {
        const absolute = await ctx.fns.workspace.normalize({dir:path || '~',host}).catch(()=>null);
        if (!absolute) return new Response('Absolute remote path required',{status:400});
        path = absolute;
    }
    if (await ctx.fns.files.isPrivateResult({path,host})) return new Response('File unavailable',{status:404});
    if (url.searchParams.get('format') === 'json') {
        try { const response=await ctx.fns.files.browserData({path,host}); response.headers.set('cache-control','no-store'); return response; }
        catch { return new Response('File unavailable',{status:404}); }
    }
    url.pathname='/ui-lab/';
    return ctx.fns.frontendBridge.proxy({req:new Request(url,{method:opts.req.method,headers:opts.req.headers})});
}
