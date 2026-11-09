/** Create a task from owner-authorized JSON without starting its agent; reject invalid data before mutation.
 * @param opts.req Incoming owner request; GET negotiates JSON and writes require a cookie-bound CSRF header.
 * @param opts.params Route parameters; detail routes use the task UUID in id.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    const me = (session as Session & { user?: types.auth.User })?.user;
    const headers = { 'cache-control': 'no-store', vary: 'Accept, Cookie' };
    if (!me) return Response.json({ error: 'Authentication required' }, { status: 401, headers });
    if (me.role !== 'owner') return Response.json({ error: 'Only owners can manage tasks' }, { status: 403, headers });
    if (!await ctx.fns.auth.verifyCsrf({ req: opts.req, token: opts.req.headers.get('x-csrf-token') || '' })) return Response.json({ error: 'Invalid request token. Reload tasks and retry.' }, { status: 403, headers });
    let data: { description?: unknown; workspaceMode?: unknown } | null;
    try { data = await opts.req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers }); }
    if (!data || typeof data.description !== 'string' || !data.description.trim()) return Response.json({ error: 'Description is required' }, { status: 400, headers });
    if (data.workspaceMode !== undefined && data.workspaceMode !== 'default' && data.workspaceMode !== 'isolated') return Response.json({ error: 'Invalid workspace mode' }, { status: 400, headers });
    const task = await ctx.fns.tasks.create({ description: data.description.trim(), workspaceMode: data.workspaceMode ?? 'default' });
    return Response.json({ task }, { status: 201, headers });
}
