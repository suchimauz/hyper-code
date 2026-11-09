/** Return an owner-only task detail or redirect a legacy detail link to the native React extension.
 * @param opts.req Incoming owner request; GET negotiates JSON and writes require a cookie-bound CSRF header.
 * @param opts.params Route parameters; detail routes use the task UUID in id.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    const me = (session as Session & { user?: types.auth.User })?.user;
    const headers = { 'cache-control': 'no-store', vary: 'Accept, Cookie' };
    if (!me) return Response.json({ error: 'Authentication required' }, { status: 401, headers });
    if (me.role !== 'owner') return Response.json({ error: 'Only owners can manage tasks' }, { status: 403, headers });
    const id = opts.params.id || '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return Response.json({ error: 'Invalid task identifier' }, { status: 400, headers });
    const task = await ctx.fns.tasks.get({ id });
    if (!task) return Response.json({ error: 'Task not found' }, { status: 404, headers });
    if (!opts.req.headers.get('accept')?.includes('application/json')) return new Response(null, { status: 303, headers: { ...headers, location: '/?view=extension:tasks/overview&task=' + encodeURIComponent(id) } });
    return Response.json({ task, csrfToken: await ctx.fns.auth.csrfToken({ req: opts.req }) }, { headers });
}
