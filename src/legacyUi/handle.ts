/**
 * Redirect retired /old-ui entry links to the primary React shell.
 *
 * Use after global authentication. Only GET and HEAD root or agent links redirect;
 * other methods return 405 without replaying writes. Unknown paths return 404.
 * Preserve only validated agent, embedded, new and view query values; a path agent wins.
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
    if (!['GET', 'HEAD'].includes(opts.req.method)) {
        return new Response(null, {status:405, headers:{allow:'GET, HEAD', 'cache-control':'no-store'}});
    }
    const path = url.pathname.slice('/old-ui'.length) || '/';
    const match = /^\/(?:agent|a)\/([A-Za-z0-9_-]+)\/?$/.exec(path);
    if (path !== '/' && (!match || match[1] === 'new')) return new Response(null, {status:404});

    const query = new URLSearchParams();
    const agentId = match?.[1] || url.searchParams.get('agent');
    if (agentId && /^[A-Za-z0-9_-]+$/.test(agentId) && agentId !== 'new') query.set('agent', agentId);
    if (url.searchParams.get('embedded') === '1') query.set('embedded', '1');
    if (!query.has('agent') && url.searchParams.get('new') === '1') query.set('new', '1');
    const view = url.searchParams.get('view');
    if (view === 'automation' || view === 'plugins') query.set('view', view);
    const search = query.toString();
    return new Response(null, {status:302, headers:{location:'/' + (search ? '?' + search : ''), 'cache-control':'no-store'}});
}
