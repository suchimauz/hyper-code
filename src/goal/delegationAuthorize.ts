/**
 * Validate a persisted descendant accounting capability inside the caller transaction
 *
 * Internal accounting-only API; keep its transaction open through checkpoint commit. Verifies source worker claim and immutable scope, all ancestor revocations, and current root goal. Does not infer lineage or authorize scheduling. NOWAIT contention requires whole-transaction retry. Stopped roots reject; idle roots are supported. Not wired to accountingCheckpoint.
 * @param opts.rootAgentId Captured accounting owner.
 * @param opts.goalId Captured immutable goal identity.
 * @param opts.sourceAgentId Actual request producer.
 * @param opts.sourceRunId Worker claim identity; must equal sourceRunToken.
 * @param opts.sourceRunToken Captured live worker claim token.
 * @param opts.capabilityId Persisted capability identifier, not lineage.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Captured accounting owner. */
        rootAgentId: string;
        /** Captured immutable goal identity. */
        goalId: string;
        /** Actual request producer. */
        sourceAgentId: string;
        /** Worker claim identity; must equal sourceRunToken. */
        sourceRunId: string;
        /** Captured live worker claim token. */
        sourceRunToken: string;
        /** Persisted capability identifier, not lineage. */
        capabilityId: string;
    },
): Promise<types.goal.DelegationAuthority> {
    if (!await ctx.fns.goal.enabled({})) throw new Error('Goal feature disabled');
    if (!opts.sourceRunId || opts.sourceRunId!==opts.sourceRunToken) throw new Error('Source run must equal worker claim');
    await ctx.fns.goal.delegationLock({rootAgentId:opts.rootAgentId,goalId:opts.goalId,sourceAgentId:opts.sourceAgentId,sourceRunToken:opts.sourceRunToken});
    let id: string|null=opts.capabilityId;
    let first=true;
    const seen=new Set<string>();
    while(id){
     if(seen.has(id) || seen.size>=128) throw new Error('Invalid or excessive capability ancestry');
     seen.add(id);
     const rows=await ctx.fns.procs.db.select({sql:'SELECT * FROM goal_delegations WHERE capability_id=?::uuid',params:[id]});
     const cap=rows[0];
     if(!cap || cap.revoked_at!=null || cap.root_agent_id!==opts.rootAgentId || cap.goal_id!==opts.goalId) throw new Error('Delegation missing or revoked');
     if(first && cap.closed_at!=null) throw new Error('Delegation claim settled');
     // Closed ancestors remain valid anchors; only explicit revocation cascades.
     if(first && (cap.source_agent_id!==opts.sourceAgentId || cap.source_run_id!==opts.sourceRunId)) throw new Error('Delegation producer mismatch');
     id=cap.parent_capability_id; first=false;
    }
    if(first) throw new Error('Missing capability');
    return Object.freeze({capabilityId:opts.capabilityId,rootAgentId:opts.rootAgentId,goalId:opts.goalId,sourceAgentId:opts.sourceAgentId,sourceRunId:opts.sourceRunId,allowContinuation:false as const});
}
