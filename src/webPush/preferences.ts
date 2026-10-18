/**
 * Read owner-bound push preferences for a main agent
 *
 * Use before push delivery or inspector rendering. Resolves owner from the agent row, never from caller input. Missing settings default on; child, hidden, archived or ownerless agents are ineligible. Performs no writes.
 * @param opts.agentId Persisted agent identifier whose owner preferences are read.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Persisted agent identifier whose owner preferences are read. */
        agentId: string;
    },
): Promise<{ input: boolean; error: boolean; eligible: boolean }> {
    const rows = await ctx.fns.procs.db.select({sql: "SELECT p.input_enabled,p.error_enabled FROM agents a JOIN users u ON u.id=a.created_by LEFT JOIN web_push_preferences p ON p.agent_id=a.id AND p.owner_id=a.created_by WHERE a.id=? AND a.parent_id IS NULL AND COALESCE(a.visibility,'nav')='nav' AND a.archived_at IS NULL AND u.disabled_at IS NULL",params:[opts.agentId]});
    if (!rows.length) return {input:false,error:false,eligible:false};
    return {input:rows[0].input_enabled !== false,error:rows[0].error_enabled !== false,eligible:true};
}
