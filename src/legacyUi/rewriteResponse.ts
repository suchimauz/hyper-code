/**
 * Rewrite legacy HTML navigation and redirect headers under /old-ui while preserving shared assets.
 *
 * Apply to canonical responses returned by the legacy adapter. Non-HTML bodies, cookies and other headers are preserved; only navigation attributes and redirect headers change.
 * @param opts.response Canonical HTTP response to adapt.
 * @param opts.origin Request origin used to identify local absolute URLs.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Canonical HTTP response to adapt. */
        response: Response;
        /** Request origin used to identify local absolute URLs. */
        origin: string;
    },
): Promise<Response> {
    const headers = new Headers(opts.response.headers);
    for (const key of ['location','hx-redirect','hx-push-url','hx-replace-url']) { const value = headers.get(key); if(value) headers.set(key,ctx.fns.legacyUi.navigationUrl({url:value,origin:opts.origin})); }
    let response = new Response(opts.response.body,{status:opts.response.status,statusText:opts.response.statusText,headers});
    if (!headers.get('content-type')?.includes('text/html')) return response;
    headers.delete('content-length'); headers.delete('etag');
    response = new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    return new HTMLRewriter().on('*',{element(el) {
     for (const attr of ['href','action','hx-push-url','hx-replace-url']) {
      if (attr === 'href' && !['a','area'].includes(el.tagName)) continue;
      const value = el.getAttribute(attr); if(value) el.setAttribute(attr,ctx.fns.legacyUi.navigationUrl({url:value,origin:opts.origin}));
     }
     // Boosted and main-panel requests are page navigation, not shared API calls.
     if (el.getAttribute('hx-target') === '#main' || el.getAttribute('hx-target') === 'main#main') { const value = el.getAttribute('hx-get'); if(value) el.setAttribute('hx-get',ctx.fns.legacyUi.navigationUrl({url:value,origin:opts.origin})); }
    }}).transform(response);
}
