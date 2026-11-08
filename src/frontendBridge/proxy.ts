import { realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

/**
 * Proxy authenticated UI Lab GET and HEAD requests to fixed local Vite
 *
 * Use only from the /ui-lab prefix middleware after global authentication. Rejects encoded paths, traversal, filesystem endpoints outside repository dependencies and non-read methods; forwards no browser credentials or arbitrary headers.
 * @param opts.req Incoming request already processed by global authentication middleware.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming request already processed by global authentication middleware. */
        req: Request;
    },
): Promise<Response | void> {
    const { req } = opts;
    const url = new URL(req.url);
    if (url.pathname !== '/ui-lab' && !url.pathname.startsWith('/ui-lab/')) return;
    if (!['GET','HEAD'].includes(req.method)) return new Response('Method not allowed', {status:405,headers:{Allow:'GET, HEAD'}});
    if (!session || !(session as {user?:object}).user) return new Response('Authentication required',{status:401});
    const raw = req.url.split('?')[0]!;
    if (/%|\\|(?:^|\/)\.{1,2}(?:\/|$)/i.test(raw)) return new Response('Forbidden path',{status:403});
    if (/@fs/i.test(url.pathname)) {
        // Vite serves shared dependencies outside frontend/. Refuse arbitrary files,
        // sibling prefixes, and symlinks escaping repository node_modules.
        const prefix = '/ui-lab/@fs/';
        const dependencies = resolve(ctx.fns.procs.project.projectRoot({}), 'node_modules');
        // Vite's POSIX URLs use @fs/home/... (one slash), not @fs//home/....
        const requested = url.pathname.startsWith(prefix) ? '/' + url.pathname.slice(prefix.length).replace(/^\/+/, '') : '';
        if (!requested.startsWith(dependencies + sep)) return new Response('Forbidden path', {status:403});
        try {
            const [root, file] = await Promise.all([realpath(dependencies), realpath(requested)]);
            if (!file.startsWith(root + sep)) return new Response('Forbidden path', {status:403});
        } catch { return new Response('Forbidden path', {status:403}); }
    }
    if (req.headers.get('upgrade')) {
     if(url.pathname === '/ui-lab/hmr' || url.pathname === '/ui-lab/terminal') return;
     return new Response('Unknown socket',{status:404});
    }
    if(url.pathname === '/ui-lab') return new Response(null,{status:307,headers:{location:'/ui-lab/'}});
    const headers = new Headers();
    for(const key of ['accept','if-none-match','if-modified-since','range']) { const value=req.headers.get(key); if(value) headers.set(key,value); }
    try {
     const upstream=await fetch('http://127.0.0.1:5174'+url.pathname+url.search,{method:req.method,headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
     const out=new Headers();
     for(const key of ['content-type','etag','last-modified','content-range','accept-ranges']) {const value=upstream.headers.get(key);if(value)out.set(key,value);}
     out.set('cache-control','no-store');out.set('x-content-type-options','nosniff');
     if(upstream.status>=300 && upstream.status<400 && upstream.status!==304) {await upstream.body?.cancel();return new Response('Upstream redirect blocked',{status:502});}
     return new Response(req.method==='HEAD'?null:upstream.body,{status:upstream.status,headers:out});
    } catch { return new Response('UI Lab Vite server unavailable',{status:502,headers:{'cache-control':'no-store'}}); }
}
