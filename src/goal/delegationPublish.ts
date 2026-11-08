/**
 * Open an initial task grant at its exact trusted publication frontier
 *
 * Internal publication-transaction hook after appendMessage and before scheduling. Validates live delegator and exact task provenance. Does not extend previously published grants or authorize human followups.
 * @param opts.reservationId Unconsumed initial task grant UUID.
 * @param opts.delegatorRunToken Real live publishing worker claim.
 * @param opts.authorizedThroughIdx Exact appended delegation_task message index. @minimum 0
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Unconsumed initial task grant UUID. */
        reservationId: string;
        /** Real live publishing worker claim. */
        delegatorRunToken: string;
        /** Exact appended delegation_task message index. @minimum 0 */
        authorizedThroughIdx: number;
    },
): Promise<void> {
    if(!await ctx.fns.goal.enabled({})) throw new Error('Goal feature disabled');
    if(!ctx.state.procs?.db?.transactionStorage?.getStore()?.active) throw new Error('Publication requires transaction');
    if(!Number.isSafeInteger(opts.authorizedThroughIdx)||opts.authorizedThroughIdx<0) throw new Error('Invalid frontier');
    const [hint]=await ctx.fns.procs.db.select({sql:'SELECT * FROM goal_delegation_reservations WHERE reservation_id=?::uuid',params:[opts.reservationId]});
    if(!hint) throw new Error('Missing grant');
    await ctx.fns.goal.delegationLock({rootAgentId:hint.root_agent_id,goalId:hint.goal_id,sourceAgentId:hint.delegator_agent_id,sourceRunToken:opts.delegatorRunToken});
    const [child]=await ctx.fns.procs.db.select({sql:'SELECT * FROM agents WHERE id=? FOR UPDATE NOWAIT',params:[hint.source_agent_id]});
    const [r]=await ctx.fns.procs.db.select({sql:'SELECT * FROM goal_delegation_reservations WHERE reservation_id=?::uuid FOR UPDATE',params:[opts.reservationId]});
    if(!r || r.task_state!=='pending_review'||r.consumed_at!=null||r.cancelled_at!=null||r.delegator_run_id!==opts.delegatorRunToken) throw new Error('Initial grant unavailable');
    if(!child||child.run_state!=='idle'||child.run_token!=null||child.next_run_at!=null) throw new Error('Unpublished idle child required');
    const [message]=await ctx.fns.procs.db.select({sql:'SELECT * FROM messages WHERE agent_id=? AND idx=?',params:[r.source_agent_id,opts.authorizedThroughIdx]});
    if(!message||message.role!=='user'||message.message_type!=='delegation_task'||message.author!=='agent:'+r.delegator_agent_id||message.excluded_from_cursor) throw new Error('Task publication provenance mismatch');
    await ctx.fns.procs.db.run({sql:"UPDATE goal_delegation_reservations SET task_state='open',authorized_through_idx=? WHERE reservation_id=?::uuid",params:[opts.authorizedThroughIdx,opts.reservationId]});
}
