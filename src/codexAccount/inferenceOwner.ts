/**
 * Resolve authenticated owner identity for isolated Codex inference
 *
 * Use for any explicitly selected isolated Codex account. Accepts an authenticated owner user or a request-free worker-bound live agent whose durable creator is still an owner. Rejects missing, unknown and mismatched sessions; never derives authority from options or credentials.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<string> {
    if (session?.user) {
        if (session.user.role !== 'owner' || !session.user.id) throw new Error('Owner required');
        return String(session.user.id);
    }
    const agent = session?.agent;
    if (!session || session.req || session.kind !== 'agent' || !agent?.id || session.agentId !== agent.id || ctx.state.agent?.[agent.id] !== agent) throw new Error('Trusted bound agent owner required');
    const rows = await ctx.fns.procs.db.select({sql: "SELECT a.created_by FROM agents a JOIN public.users u ON u.id = a.created_by WHERE a.id = ? AND a.archived_at IS NULL AND u.role = 'owner'", params: [agent.id]});
    const owner = rows[0]?.created_by;
    if (typeof owner !== 'string' || !owner) throw new Error('Agent owner required');
    return owner;
}
