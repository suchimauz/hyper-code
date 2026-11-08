/**
 * Register immutable accounting authority for overlapping delegator and child claims
 *
 * Internal staged API, not integrated with delegation or worker. Requires concurrent real worker claims; cannot bind a queued future run. Locks root before NOWAIT producer locks. Retry entire transaction on contention. Inherited authority requires a durable same-root capability, never lineage. Does not schedule work or apply migrations.
 * @param opts.rootAgentId Immutable accounting root.
 * @param opts.goalId Current immutable goal identity.
 * @param opts.delegatorAgentId Actual delegator identity.
 * @param opts.delegatorRunToken Live delegator worker claim.
 * @param opts.sourceAgentId Child with an overlapping live worker claim.
 * @param opts.sourceRunToken Child worker token, used as sourceRunId.
 * @param opts.parentCapabilityId Required inherited capability for non-root delegator.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Immutable accounting root. */
        rootAgentId: string;
        /** Current immutable goal identity. */
        goalId: string;
        /** Actual delegator identity. */
        delegatorAgentId: string;
        /** Live delegator worker claim. */
        delegatorRunToken: string;
        /** Child with an overlapping live worker claim. */
        sourceAgentId: string;
        /** Child worker token, used as sourceRunId. */
        sourceRunToken: string;
        /** Required inherited capability for non-root delegator. */
        parentCapabilityId?: string;
    },
): Promise<types.goal.DelegationAuthority> {
    if(!await ctx.fns.goal.enabled({})) throw new Error('Goal feature disabled');
    return await ctx.fns.procs.db.transaction({fn:async()=>{
     if(opts.sourceAgentId===opts.rootAgentId || opts.sourceAgentId===opts.delegatorAgentId) throw new Error('Distinct descendant required');
     await ctx.fns.goal.delegationLock({rootAgentId:opts.rootAgentId,goalId:opts.goalId,sourceAgentId:opts.delegatorAgentId,sourceRunToken:opts.delegatorRunToken});
     if(opts.delegatorAgentId!==opts.rootAgentId){
      if(!opts.parentCapabilityId) throw new Error('Inherited capability required');
      await ctx.fns.goal.delegationAuthorize({rootAgentId:opts.rootAgentId,goalId:opts.goalId,sourceAgentId:opts.delegatorAgentId,sourceRunId:opts.delegatorRunToken,sourceRunToken:opts.delegatorRunToken,capabilityId:opts.parentCapabilityId});
     }else if(opts.parentCapabilityId) throw new Error('Root grant cannot inherit');
     const read=await ctx.fns.goal.read({agentId:opts.rootAgentId});
     if(!read.enabled || read.goal?.status!=='active') throw new Error('Active goal required');
     await ctx.fns.goal.delegationLock({rootAgentId:opts.rootAgentId,goalId:opts.goalId,sourceAgentId:opts.sourceAgentId,sourceRunToken:opts.sourceRunToken});
     const rows=await ctx.fns.procs.db.select({sql:'SELECT * FROM goal_delegations WHERE root_agent_id=? AND goal_id=?::uuid AND source_agent_id=? AND source_run_id=?',params:[opts.rootAgentId,opts.goalId,opts.sourceAgentId,opts.sourceRunToken]});
     const saved=rows[0];
     if(saved && (saved.revoked_at!=null || saved.delegator_agent_id!==opts.delegatorAgentId || saved.delegator_run_id!==opts.delegatorRunToken || saved.parent_capability_id!==(opts.parentCapabilityId??null))) throw new Error('Immutable delegation conflict');
     const capabilityId=saved?.capability_id??crypto.randomUUID();
     if(!saved) await ctx.fns.procs.db.run({sql:'INSERT INTO goal_delegations(capability_id,root_agent_id,goal_id,source_agent_id,source_run_id,delegator_agent_id,delegator_run_id,parent_capability_id,created_at) VALUES (?::uuid,?,?::uuid,?,?,?,?,?::uuid,?)',params:[capabilityId,opts.rootAgentId,opts.goalId,opts.sourceAgentId,opts.sourceRunToken,opts.delegatorAgentId,opts.delegatorRunToken,opts.parentCapabilityId??null,Date.now()]});
     return Object.freeze({capabilityId,rootAgentId:opts.rootAgentId,goalId:opts.goalId,sourceAgentId:opts.sourceAgentId,sourceRunId:opts.sourceRunToken,allowContinuation:false as const});
    }}) as types.goal.DelegationAuthority;
}
