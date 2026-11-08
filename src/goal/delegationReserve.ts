/**
 * Reserve an immutable task grant for one idle unscheduled child
 *
 * Internal publication-transaction helper. Requires live delegator claim and durable inherited capability, never lineage. Caller publishes child messages and scheduling in the same transaction. Root-first and NOWAIT locks require whole transaction retry. Manual fork snapshots must remain separate. New grants remain pending_review until delegationPublish records the initial task frontier; this function alone never enables consumption.
 * @param opts.rootAgentId Original accounting root.
 * @param opts.goalId Immutable root goal UUID.
 * @param opts.delegatorAgentId Live delegator identity.
 * @param opts.delegatorRunToken Real delegator worker token.
 * @param opts.sourceAgentId Concrete idle unscheduled child.
 * @param opts.parentCapabilityId Inherited capability required for non-root delegator.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Original accounting root. */
        rootAgentId: string;
        /** Immutable root goal UUID. */
        goalId: string;
        /** Live delegator identity. */
        delegatorAgentId: string;
        /** Real delegator worker token. */
        delegatorRunToken: string;
        /** Concrete idle unscheduled child. */
        sourceAgentId: string;
        /** Inherited capability required for non-root delegator. */
        parentCapabilityId?: string;
    },
): Promise<types.goal.DelegationReservation> {
    if (!await ctx.fns.goal.enabled({})) throw new Error('Goal feature disabled');
    if (!ctx.state.procs?.db?.transactionStorage?.getStore()?.active) throw new Error('Reservation requires publication transaction');
    if (opts.sourceAgentId===opts.rootAgentId || opts.sourceAgentId===opts.delegatorAgentId) throw new Error('Distinct child required');
    await ctx.fns.goal.delegationLock({rootAgentId:opts.rootAgentId,goalId:opts.goalId,sourceAgentId:opts.delegatorAgentId,sourceRunToken:opts.delegatorRunToken});
    if(opts.delegatorAgentId!==opts.rootAgentId){
     if(!opts.parentCapabilityId) throw new Error('Inherited capability required');
     await ctx.fns.goal.delegationAuthorize({rootAgentId:opts.rootAgentId,goalId:opts.goalId,sourceAgentId:opts.delegatorAgentId,sourceRunId:opts.delegatorRunToken,sourceRunToken:opts.delegatorRunToken,capabilityId:opts.parentCapabilityId});
    }else if(opts.parentCapabilityId) throw new Error('Root grant cannot inherit');
    const goal=await ctx.fns.goal.read({agentId:opts.rootAgentId});
    if(!goal.enabled || goal.goal?.status!=='active') throw new Error('Active goal required');
    const [child]=await ctx.fns.procs.db.select({sql:'SELECT * FROM agents WHERE id=? FOR UPDATE NOWAIT',params:[opts.sourceAgentId]});
    if(!child || child.run_state!=='idle' || child.run_token!=null || child.next_run_at!=null || child.stopped_at!=null || child.archived_at!=null) throw new Error('Idle unscheduled child required');
    const snapshot=await ctx.fns.goal.read({agentId:opts.sourceAgentId});
    if(snapshot.enabled && snapshot.goal) throw new Error('Descendant cannot own a fork snapshot');
    const [saved]=await ctx.fns.procs.db.select({sql:'SELECT * FROM goal_delegation_reservations WHERE source_agent_id=?',params:[opts.sourceAgentId]});
    if(saved && (saved.cancelled_at!=null || saved.task_state==='closed' || saved.consumed_at!=null || saved.root_agent_id!==opts.rootAgentId || saved.goal_id!==opts.goalId || saved.delegator_agent_id!==opts.delegatorAgentId || saved.delegator_run_id!==opts.delegatorRunToken || saved.parent_capability_id!==(opts.parentCapabilityId??null))) throw new Error('Immutable reservation conflict');
    if(!saved && child.goal_delegation_required) throw new Error('Missing required reservation');
    const reservationId=saved?.reservation_id??crypto.randomUUID();
    if(!saved) await ctx.fns.procs.db.run({sql:'INSERT INTO goal_delegation_reservations(reservation_id,root_agent_id,goal_id,source_agent_id,delegator_agent_id,delegator_run_id,parent_capability_id,created_at) VALUES (?::uuid,?,?::uuid,?,?,?,?::uuid,?)',params:[reservationId,opts.rootAgentId,opts.goalId,opts.sourceAgentId,opts.delegatorAgentId,opts.delegatorRunToken,opts.parentCapabilityId??null,Date.now()]});
    await ctx.fns.procs.db.run({sql:'UPDATE agents SET goal_delegation_required=true WHERE id=?',params:[opts.sourceAgentId]});
    return Object.freeze({reservationId,rootAgentId:opts.rootAgentId,goalId:opts.goalId,sourceAgentId:opts.sourceAgentId});
}
