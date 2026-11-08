/**
 * Close a drained worker claim using its exact final committed accounting receipt
 *
 * Trusted worker-finalization transaction hook only, after draining requests and flushing final known usage, before releasing the actual claim. Receipt identity is not proof that requests drained: caller must enforce that invariant. Update successful authorized cursor before terminal settlement in this same transaction. Retry does not extend input frontier. Unknown or pending usage must never call this helper. No stale-claim recovery.
 * @param opts.sourceAgentId Actual claimed child.
 * @param opts.sourceRunToken Still-live actual worker token.
 * @param opts.checkpointId Exact final committed checkpoint ID.
 * @param opts.sequence Exact final checkpoint sequence. @minimum 0
 * @param opts.outcome Retry permits a new claim on the same frontier; terminal closes task.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Actual claimed child. */
        sourceAgentId: string;
        /** Still-live actual worker token. */
        sourceRunToken: string;
        /** Exact final committed checkpoint ID. */
        checkpointId: string;
        /** Exact final checkpoint sequence. @minimum 0 */
        sequence: number;
        /** Retry permits a new claim on the same frontier; terminal closes task. */
        outcome: "retry" | "terminal";
    },
): Promise<void> {
    if(!await ctx.fns.goal.enabled({})) throw new Error('Goal feature disabled');
    if(!ctx.state.procs?.db?.transactionStorage?.getStore()?.active) throw new Error('Settlement requires finalization transaction');
    if(!Number.isSafeInteger(opts.sequence)||opts.sequence<0) throw new Error('Invalid final sequence');
    const [hint]=await ctx.fns.procs.db.select({sql:'SELECT * FROM goal_delegation_reservations WHERE source_agent_id=?',params:[opts.sourceAgentId]});
    if(!hint) throw new Error('Missing grant');
    await ctx.fns.goal.delegationLock({rootAgentId:hint.root_agent_id,goalId:hint.goal_id,sourceAgentId:opts.sourceAgentId,sourceRunToken:opts.sourceRunToken});
    const [r]=await ctx.fns.procs.db.select({sql:'SELECT * FROM goal_delegation_reservations WHERE reservation_id=?::uuid FOR UPDATE',params:[hint.reservation_id]});
    if(!r||r.task_state!=='open'||r.cancelled_at!=null) throw new Error('Task grant not open');
    const [cap]=await ctx.fns.procs.db.select({sql:'SELECT * FROM goal_delegations WHERE reservation_id=?::uuid AND source_run_id=? FOR UPDATE',params:[r.reservation_id,opts.sourceRunToken]});
    if(!cap||cap.closed_at!=null) throw new Error('Claim missing or already settled');
    await ctx.fns.goal.delegationAuthorize({rootAgentId:r.root_agent_id,goalId:r.goal_id,sourceAgentId:opts.sourceAgentId,sourceRunId:opts.sourceRunToken,sourceRunToken:opts.sourceRunToken,capabilityId:cap.capability_id});
    const [receipt]=await ctx.fns.procs.db.select({sql:'SELECT checkpoint_id,sequence FROM goal_usage_checkpoints WHERE agent_id=? AND goal_id=?::uuid AND source_agent_id=? AND run_id=? ORDER BY id DESC LIMIT 1',params:[r.root_agent_id,r.goal_id,opts.sourceAgentId,opts.sourceRunToken]});
    if(!receipt||receipt.checkpoint_id!==opts.checkpointId||Number(receipt.sequence)!==opts.sequence) throw new Error('Final receipt mismatch');
    if(opts.outcome==='terminal'){
     const [source]=await ctx.fns.procs.db.select({sql:'SELECT * FROM agents WHERE id=?',params:[opts.sourceAgentId]});
     if(!source||source.next_run_at!=null||Number(source.last_processed_msg_idx)<Number(r.authorized_through_idx)) throw new Error('Authorized task work not settled');
    }
    const now=Date.now();
    await ctx.fns.procs.db.run({sql:'UPDATE goal_delegations SET closed_at=?,close_reason=?,settled_checkpoint_id=?,settled_sequence=? WHERE capability_id=?::uuid',params:[now,opts.outcome,opts.checkpointId,opts.sequence,cap.capability_id]});
    if(opts.outcome==='retry') await ctx.fns.procs.db.run({sql:'UPDATE goal_delegation_reservations SET retry_from_run_id=? WHERE reservation_id=?::uuid',params:[opts.sourceRunToken,r.reservation_id]});
    else await ctx.fns.procs.db.run({sql:"UPDATE goal_delegation_reservations SET task_state='closed',closed_at=?,close_reason='terminal',retry_from_run_id=NULL WHERE reservation_id=?::uuid",params:[now,r.reservation_id]});
}
