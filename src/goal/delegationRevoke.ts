/**
 * Revoke a root-scoped accounting capability and thereby all inherited grants
 *
 * Internal live-root-token mutation; serializes with authorization under root owner lock. Revocation is irreversible and descendants are denied by ancestor checks. No scheduling. Idle or stopped owners need a future trusted external revocation adapter; deletion and goal replacement already deny authorization.
 * @param opts.rootAgentId Accounting owner.
 * @param opts.goalId Current immutable goal identity.
 * @param opts.rootRunToken Actual live root worker claim.
 * @param opts.capabilityId Persisted capability to revoke within this root and goal.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Accounting owner. */
        rootAgentId: string;
        /** Current immutable goal identity. */
        goalId: string;
        /** Actual live root worker claim. */
        rootRunToken: string;
        /** Persisted capability to revoke within this root and goal. */
        capabilityId: string;
    },
): Promise<void> {
    if(!await ctx.fns.goal.enabled({})) throw new Error('Goal feature disabled');
    await ctx.fns.procs.db.transaction({fn:async()=>{
     await ctx.fns.goal.delegationLock({rootAgentId:opts.rootAgentId,goalId:opts.goalId,sourceAgentId:opts.rootAgentId,sourceRunToken:opts.rootRunToken});
     await ctx.fns.procs.db.run({sql:'UPDATE goal_delegations SET revoked_at=COALESCE(revoked_at,?) WHERE capability_id=?::uuid AND root_agent_id=? AND goal_id=?::uuid',params:[Date.now(),opts.capabilityId,opts.rootAgentId,opts.goalId]});
    }});
}
