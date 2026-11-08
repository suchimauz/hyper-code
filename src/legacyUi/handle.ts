/**
 * Serve /old-ui requests by authenticated in-process canonical dispatch.
 *
 * Use from the old-ui middleware. Canonical dispatch reruns authentication and CSRF checks, retains the original request body and sets a server-only legacy UI session marker.
 * @param opts.req Incoming prefixed browser request, with original headers and body.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming prefixed browser request, with original headers and body. */
        req: Request;
    },
): Promise<Response | undefined> {
    const url = new URL(opts.req.url);
    if (url.pathname !== '/old-ui' && !url.pathname.startsWith('/old-ui/')) return;
    url.pathname = url.pathname.slice('/old-ui'.length) || '/';
    // Reject nested adapters and URL parser normalization tricks.
    if (url.pathname.startsWith('//') || /^\/old-ui(?:\/|$)/.test(url.pathname)) return new Response('Not Found',{status:404});
    const response = await ctx.fns.procs.http.dispatch({url:url.href,request:opts.req,legacyUi:true});
    return ctx.fns.legacyUi.rewriteResponse({response,origin:url.origin});
}
