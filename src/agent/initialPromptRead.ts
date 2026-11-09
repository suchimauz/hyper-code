/**
 * Read the exact assembled full system prompt after durable owner authorization
 *
 * Use for the native read-only initial prompt reader. This reproduces the former popup fullSystemPrompt semantics, not a historical snapshot or first user message. Denies other owners before loading any agent or assembling any prompt.
 * @param opts.req Browser request used to authenticate the owning user.
 * @param opts.agentId Exact durable agent identifier whose current assembled prompt is requested.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Browser request used to authenticate the owning user. */
        req: Request;
        /** Exact durable agent identifier whose current assembled prompt is requested. */
        agentId: string;
    },
): Promise<Response> {
    const headers = { 'cache-control': 'no-store' };
    const id = opts.agentId;
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return new Response('Not Found', { status: 404, headers });
    const who = await ctx.fns.auth.currentUser({ req: opts.req });
    if (who.required && !who.user && !who.legacy) return new Response('Authentication required', { status: 401, headers });
    const rows = await ctx.fns.procs.db.select({ sql: 'SELECT created_by FROM agents WHERE id = ?', params: [id] });
    const owner = rows[0];
    if (!owner || (who.user ? owner.created_by !== who.user.id : owner.created_by != null)) return new Response('Not Found', { status: 404, headers });
    const agent = ctx.state.agent?.[id] ?? await ctx.fns.session.load({ id });
    if (!agent) return new Response('Not Found', { status: 404, headers });
    const prompt = await ctx.fns.agent.fullSystemPrompt({ agent });
    return Response.json({ agentId: id, title: agent.title || id, prompt, characters: prompt.length, estimatedTokens: Math.ceil(prompt.length / 4) }, { headers });
}
