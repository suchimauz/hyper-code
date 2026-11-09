/** Set an existing task status from owner-authorized JSON; completion remains an explicit user action.
 * @param opts.req Incoming owner request; GET negotiates JSON and writes require a cookie-bound CSRF header.
 * @param opts.params Route parameters; detail routes use the task UUID in id.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    const me = (session as Session & { user?: types.auth.User })?.user;
    const headers = { 'cache-control': 'no-store', vary: 'Accept, Cookie' };
    if (!me) return Response.json({ error: 'Authentication required' }, { status: 401, headers });
    if (me.role !== 'owner') return Response.json({ error: 'Only owners can manage tasks' }, { status: 403, headers });
    if (!await ctx.fns.auth.verifyCsrf({ req: opts.req, token: opts.req.headers.get('x-csrf-token') || '' })) return Response.json({ error: 'Invalid request token. Reload tasks and retry.' }, { status: 403, headers });
    const id = opts.params.id || '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return Response.json({ error: 'Invalid task identifier' }, { status: 400, headers });
    let data: { status?: unknown } | null;
    try { data = await opts.req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers }); }
    const status = data?.status;
    if (status !== 'todo' && status !== 'running' && status !== 'done') return Response.json({ error: 'Invalid status' }, { status: 400, headers });
    if (!await ctx.fns.tasks.get({ id })) return Response.json({ error: 'Task not found' }, { status: 404, headers });
    return Response.json({ task: await ctx.fns.tasks.setStatus({ id, status }) }, { headers });
}
