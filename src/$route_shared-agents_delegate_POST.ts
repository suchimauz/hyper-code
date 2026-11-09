/** Apply an explicitly confirmed delegate request from the Shared Agents React page.
 * @param opts.req Owner-authenticated JSON request with cookie-bound X-CSRF-Token.
 * @param opts.params Unused route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const headers = { 'cache-control': 'no-store' };
    if (session?.user?.role !== 'owner') return Response.json({ error: 'Only owners can manage shared agents' }, { status: 403, headers });
    if (!await ctx.fns.auth.verifyCsrf({ req: opts.req, token: opts.req.headers.get('x-csrf-token') ?? '' })) return Response.json({ error: 'Invalid CSRF token' }, { status: 403, headers });
    try {
        const parsed = await opts.req.json();
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return Response.json({ error: 'JSON object required' }, { status: 400, headers });
        const body = parsed as Record<string, unknown>;
        if (!body || body.confirmed !== true || typeof body.agentId !== 'string' || !body.agentId.trim() || typeof body.task !== 'string' || !body.task.trim() || (body.requesterId !== undefined && typeof body.requesterId !== 'string')) return Response.json({ error: 'Confirmed request with valid fields required' }, { status: 400, headers });
        const result = await ctx.fns.sharedAgent.delegate({ agentId: body.agentId, task: body.task, requesterId: body.requesterId || undefined });
        return Response.json({ ok: true, result }, { headers });
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: 400, headers });
    }
}
