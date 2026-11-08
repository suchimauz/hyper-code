/**
 * Read an authoritative goal snapshot without admitting work.
 *
 * Returns disabled separately from an absent goal. Gate check happens before accessing agent_goals. Does not consult mutable legacy agents.goal.
 * @param opts.agentId Owner whose goal is requested.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Owner whose goal is requested. */
        agentId: string;
    },
): Promise<{ enabled: false } | { enabled: true; goal: types.goal.State | null }> {
    if (!await ctx.fns.goal.enabled({})) return {enabled:false};
    const rows = await ctx.fns.procs.db.select({sql:'SELECT agent_id AS "agentId", goal_id AS "goalId", schema_version AS "schemaVersion", revision::float8 AS revision, objective, status, token_budget::float8 AS "tokenBudget", tokens_used::float8 AS "tokensUsed", time_used_seconds::float8 AS "timeUsedSeconds", created_at::float8 AS "createdAt", updated_at::float8 AS "updatedAt" FROM agent_goals WHERE agent_id = ?',params:[opts.agentId]}) as types.goal.State[];
    return {enabled:true,goal:rows[0]??null};
}
