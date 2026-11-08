/**
 * Apply an external goal edit at a reserved accounting boundary
 *
 * Trusted internal caller only, not a model tool or authorization boundary. Uses a nonwaiting local barrier shared with complete dispatch/tool cycles. Running edits require the exact local root binding and drain its old-objective accounting before CAS; successful edits seal that binding. Remote owners, pending requests and delegation authorities fail closed. Does not clear Stop, enqueue messages, or automatically activate paused goals. Active edits remain state-only.
 * @param opts.agentId Exact goal owner selected by the trusted caller.
 * @param opts.expectedGoalId Previously observed goal identity; null asserts absence.
 * @param opts.expectedRevision Previously observed revision; never refreshed on conflict.
 * @param opts.expectedRunToken Previously observed owner claim; running mutation requires the matching local binding.
 * @param opts.objective Replacement objective; omission preserves existing.
 * @param opts.status Explicit requested status; omission preserves existing status.
 * @param opts.tokenBudget Replacement cap; null removes the cap and omission preserves it.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact goal owner selected by the trusted caller. */
        agentId: string;
        /** Previously observed goal identity; null asserts absence. */
        expectedGoalId: string | null;
        /** Previously observed revision; never refreshed on conflict. */
        expectedRevision: number | null;
        /** Previously observed owner claim; running mutation requires the matching local binding. */
        expectedRunToken: string | null;
        /** Replacement objective; omission preserves existing. */
        objective?: string;
        /** Explicit requested status; omission preserves existing status. */
        status?: types.goal.State["status"];
        /** Replacement cap; null removes the cap and omission preserves it. */
        tokenBudget?: number | null;
    },
): Promise<{goal: types.goal.State | null; resume: {scheduled: false; reason: string}}> {
    if (!await ctx.fns.goal.enabled({})) throw new Error('Goal feature disabled');
    const lease=await ctx.fns.goal.ownerBarrier({action:'acquire',agentId:opts.agentId,runToken:opts.expectedRunToken});
    if (!lease) throw new Error('Goal busy: dispatch/accounting boundary reserved; retry explicitly');
    let state: types.goal.RunState | undefined;
    let revision=opts.expectedRevision;
    try {
     if (opts.expectedRunToken !== null) {
      state=await ctx.fns.goal.runStopRegistry({action:'get',agentId:opts.agentId,runToken:opts.expectedRunToken});
      if (!state || state.sealed || state.blocked || state.binding.authority || state.binding.rootAgentId!==opts.agentId || state.binding.goalId!==opts.expectedGoalId || state.revision!==opts.expectedRevision || state.pendingRequests.size) throw new Error('Goal conflict: no drained local source boundary');
      const before=await ctx.fns.goal.read({agentId:opts.agentId});
      if (!before.enabled || !before.goal || before.goal.goalId!==opts.expectedGoalId || before.goal.revision!==opts.expectedRevision || before.goal.objective!==state.binding.objective) throw new Error('Goal conflict: observed boundary changed');
      const checkpoint=await ctx.fns.goal.runCheckpointFlush({state,maxAttempts:1});
      if (checkpoint.kind!=='committed') throw new Error('Goal conflict: source accounting did not commit');
      revision=checkpoint.revision;
     }
    const result=await ctx.fns.procs.db.transaction({fn: async () => {
     const owner=(await ctx.fns.procs.db.select({sql:'SELECT run_token,run_state,archived_at FROM agents WHERE id=? FOR UPDATE',params:[opts.agentId]}))[0];
     if (!owner || owner.archived_at != null) throw new Error('Goal owner unavailable');
     if (owner.run_token !== opts.expectedRunToken || owner.run_state !== (state?'running':'idle') || state?.sealed) throw new Error('Goal conflict: owner claim changed or boundary sealed');
     const delegated=(await ctx.fns.procs.db.select({sql:`SELECT (
      EXISTS(SELECT 1 FROM goal_delegation_reservations WHERE root_agent_id=? AND goal_id=?::uuid AND task_state IN ('open','pending_review'))
      OR EXISTS(SELECT 1 FROM goal_delegations WHERE root_agent_id=? AND goal_id=?::uuid AND (closed_at IS NULL OR reservation_id IS NULL))
     ) AS outstanding`,params:[opts.agentId,opts.expectedGoalId,opts.agentId,opts.expectedGoalId]}))[0];
     if (!delegated || delegated.outstanding) throw new Error('Goal conflict: outstanding source accounting authority');
     const goal=await ctx.fns.goal.persistTx({agentId:opts.agentId,expectedGoalId:opts.expectedGoalId,expectedRevision:revision,command:{kind:'set',objective:opts.objective,status:opts.status,tokenBudget:opts.tokenBudget}});
     return {goal,resume:{scheduled:false as const,reason:opts.status!=='active'?'not_requested':goal?.status!=='active'?'goal_not_active':'native_goal_tools_unavailable'}};
    }}) as {goal: types.goal.State | null; resume: {scheduled: false; reason: string}};
    if (state) state.sealed=true;
    return result;
    } finally {
     await ctx.fns.goal.ownerBarrier({action:'release',agentId:opts.agentId,runToken:opts.expectedRunToken,lease});
    }
}
