/**
 * Cancel a reserved child and revoke its consumed capability
 *
 * Internal root-worker-authorized terminal cancellation. Root-first locking serializes consumption and revocation. Required marker remains forever on this child. User Stop needs a separate trusted adapter, not a forged worker token.
 * @param opts.rootAgentId Original accounting root.
 * @param opts.goalId Immutable root goal UUID.
 * @param opts.rootRunToken Live real root worker claim.
 * @param opts.reservationId Exact reservation UUID.
 * @param opts.reason Optional cancellation diagnostic.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Original accounting root. */
        rootAgentId: string;
        /** Immutable root goal UUID. */
        goalId: string;
        /** Live real root worker claim. */
        rootRunToken: string;
        /** Exact reservation UUID. */
        reservationId: string;
        /** Optional cancellation diagnostic. */
        reason?: string;
    },
): Promise<void> {
    if(!await ctx.fns.goal.enabled({})) throw new Error('Goal feature disabled');
    await ctx.fns.procs.db.transaction({fn:async()=>{
    await ctx.fns.goal.delegationLock({rootAgentId:opts.rootAgentId,goalId:opts.goalId,sourceAgentId:opts.rootAgentId,sourceRunToken:opts.rootRunToken});
    const [hint]=await ctx.fns.procs.db.select({sql:'SELECT * FROM goal_delegation_reservations WHERE reservation_id=?::uuid',params:[opts.reservationId]});
    if(!hint || hint.root_agent_id!==opts.rootAgentId || hint.goal_id!==opts.goalId) throw new Error('Reservation scope mismatch');
    await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? FOR UPDATE NOWAIT',params:[hint.source_agent_id]});
    const [r]=await ctx.fns.procs.db.select({sql:'SELECT * FROM goal_delegation_reservations WHERE reservation_id=?::uuid FOR UPDATE',params:[opts.reservationId]});
    if(!r || r.root_agent_id!==opts.rootAgentId || r.goal_id!==opts.goalId) throw new Error('Reservation scope mismatch');
    const now=Date.now();
    await ctx.fns.procs.db.run({sql:'UPDATE goal_delegation_reservations SET cancelled_at=COALESCE(cancelled_at,?),cancel_reason=COALESCE(cancel_reason,?) WHERE reservation_id=?::uuid',params:[now,opts.reason??'cancelled',opts.reservationId]});
    await ctx.fns.procs.db.run({sql:"UPDATE goal_delegation_reservations SET task_state='cancelled',retry_from_run_id=NULL WHERE reservation_id=?::uuid",params:[opts.reservationId]});
    await ctx.fns.procs.db.run({sql:'UPDATE goal_delegations SET revoked_at=COALESCE(revoked_at,?) WHERE reservation_id=?::uuid OR capability_id=?::uuid',params:[now,opts.reservationId,r.capability_id]});
    }});
}
