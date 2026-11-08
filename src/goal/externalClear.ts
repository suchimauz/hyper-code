/**
 * Clear an idle isolated goal under an exact owner barrier and snapshot CAS
 *
 * Trusted internal orchestration only, not authorization. Rejects running owners and outstanding delegated accounting authority; holds a nonwaiting owner barrier and transaction while clearing. Never clears Stop or schedules work.
 * @param opts.agentId Independently authorized exact owner.
 * @param opts.expectedGoalId Observed existing goal UUID.
 * @param opts.expectedRevision Observed goal revision. @minimum 1
 * @param opts.expectedRunToken Explicit idle claim expectation; active sources cannot clear.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Independently authorized exact owner. */
        agentId: string;
        /** Observed existing goal UUID. */
        expectedGoalId: string;
        /** Observed goal revision. @minimum 1 */
        expectedRevision: number;
        /** Explicit idle claim expectation; active sources cannot clear. */
        expectedRunToken: null;
    },
): Promise<{goal:null;resume:{scheduled:false;reason:string}}> {
    if(!await ctx.fns.goal.enabled({}))throw new Error('Goal feature disabled');
    if(opts.expectedRunToken!==null)throw new Error('Goal conflict: clear requires idle owner');
    const lease=await ctx.fns.goal.ownerBarrier({action:'acquire',agentId:opts.agentId,runToken:null});
    if(!lease)throw new Error('Goal busy: dispatch/accounting boundary reserved');
    try {
    return await ctx.fns.procs.db.transaction({fn:async()=>{
    const owner=(await ctx.fns.procs.db.select({sql:'SELECT run_token,run_state,archived_at FROM agents WHERE id=? FOR UPDATE',params:[opts.agentId]}))[0];
    if(!owner||owner.archived_at!=null||owner.run_token!==null||owner.run_state!=='idle')throw new Error('Goal conflict: clear requires idle owner');
    const delegated=(await ctx.fns.procs.db.select({sql:`SELECT (EXISTS(SELECT 1 FROM goal_delegation_reservations WHERE root_agent_id=? AND goal_id=?::uuid AND task_state IN ('open','pending_review')) OR EXISTS(SELECT 1 FROM goal_delegations WHERE root_agent_id=? AND goal_id=?::uuid AND (closed_at IS NULL OR reservation_id IS NULL))) AS outstanding`,params:[opts.agentId,opts.expectedGoalId,opts.agentId,opts.expectedGoalId]}))[0];
    if(!delegated||delegated.outstanding)throw new Error('Goal conflict: outstanding source accounting authority');
    await ctx.fns.goal.persistTx({agentId:opts.agentId,expectedGoalId:opts.expectedGoalId,expectedRevision:opts.expectedRevision,command:{kind:'clear'}});
    return {goal:null,resume:{scheduled:false as const,reason:'cleared'}};
    }}) as {goal:null;resume:{scheduled:false;reason:string}};
    }finally{await ctx.fns.goal.ownerBarrier({action:'release',agentId:opts.agentId,runToken:null,lease});}
}
