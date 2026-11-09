/** Return owner-only task data or redirect legacy task-list links to the native React extension.
 * @param opts.req Incoming owner request; GET negotiates JSON and writes require a cookie-bound CSRF header.
 * @param opts.params Route parameters; detail routes use the task UUID in id.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    const me = (session as Session & { user?: types.auth.User })?.user;
    const headers = { 'cache-control': 'no-store', vary: 'Accept, Cookie' };
    if (!me) return Response.json({ error: 'Authentication required' }, { status: 401, headers });
    if (me.role !== 'owner') return Response.json({ error: 'Only owners can manage tasks' }, { status: 403, headers });
    if (!opts.req.headers.get('accept')?.includes('application/json')) {
        const url = new URL(opts.req.url);
        const query = new URLSearchParams({ view: 'extension:tasks/overview' });
        if (url.searchParams.get('view') === 'closed') query.set('taskView', 'closed');
        if (url.searchParams.get('q')) query.set('q', url.searchParams.get('q')!);
        return new Response(null, { status: 303, headers: { ...headers, location: '/?' + query } });
    }
    return Response.json({ tasks: await ctx.fns.tasks.list({}), csrfToken: await ctx.fns.auth.csrfToken({ req: opts.req }) }, { headers });
}
