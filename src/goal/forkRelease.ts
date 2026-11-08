/**
 * Release a fork barrier at a validated live turn start with accounting baseline.
 *
 * Internal turn-start hook after a valid usage baseline is established, not a resume hook. Checks the live worker token and scoped goal. Does not change status, schedule, or clear the stop marker. Never call merely because external set requested active.
 * @param opts.agentId Owner starting the valid turn.
 * @param opts.goalId Goal identity bound to the turn baseline.
 * @param opts.runToken Current worker lease token.
 * @param opts.baselineAvailable True only after accounting captured a valid turn baseline.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Owner starting the valid turn. */
        agentId: string;
        /** Goal identity bound to the turn baseline. */
        goalId: string;
        /** Current worker lease token. */
        runToken: string;
        /** True only after accounting captured a valid turn baseline. */
        baselineAvailable: boolean;
    },
): Promise<boolean> {
    if (!await ctx.fns.goal.enabled({}) || !opts.baselineAvailable) return false;
    return await ctx.fns.procs.db.transaction({fn:async()=>{
    const owner=(await ctx.fns.procs.db.select({sql:'SELECT run_token,run_state,stopped_at,archived_at FROM agents WHERE id=? FOR UPDATE',params:[opts.agentId]}))[0];
    if(!owner || !opts.runToken || owner.run_token!==opts.runToken || owner.run_state!=='running' || owner.stopped_at!=null || owner.archived_at!=null) return false;
    const goal=(await ctx.fns.procs.db.select({sql:'SELECT goal_id FROM agent_goals WHERE agent_id=? FOR UPDATE',params:[opts.agentId]}))[0];
    if(!goal || goal.goal_id!==opts.goalId) return false;
    const result=await ctx.fns.procs.db.run({sql:"DELETE FROM goal_continuation_deferrals WHERE agent_id=? AND goal_id=? AND reason='fork_snapshot'",params:[opts.agentId,opts.goalId]});
    return result.changes>0;
    }}) as boolean;
}
