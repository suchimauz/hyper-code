/**
 * Persist deduplicated cumulative goal usage under owner lock and revision CAS
 *
 * Internal checkpoint writer, disabled before SQL. Serialize each source from snapshot through commit. On revision conflict reread revision and retry identical snapshot without advancing baselines. Revoked tokens always reject: terminal flush must occur before revocation. Only root source charges elapsed; unknown usage blocks. Does not schedule or steer.
 * @param opts.authority Trusted worker-consumed descendant capability; omitted for root accounting. Revalidated in the ledger transaction.
 * @param opts.agentId Root goal owner.
 * @param opts.goalId Immutable goal identity.
 * @param opts.expectedRevision Observed revision; reread and retry identical snapshot on conflict.
 * @param opts.runToken Actual source worker claim token; root token only for root-source accounting. Flush before revocation.
 * @param opts.sourceAgentId Direct request producer, not subtree aggregate.
 * @param opts.runId Source run identity.
 * @param opts.checkpointId Stable checkpoint retry key.
 * @param opts.sequence Strictly increasing source sequence; serialize through commit.
 * @param opts.clockEpoch Process monotonic clock epoch.
 * @param opts.current Exact cumulative decimal i64 source counters.
 * @param opts.quality Unknown usage blocks before SQL.
 * @param opts.boundaryGoalId Goal captured at activation/delegation boundary.
 * @param opts.boundaryRootAgentId Explicit root subscription, not lineage.
 * @param opts.nowMs Monotonic capture timestamp.
 * @param opts.initialNowMs Initial source run monotonic baseline.
 * @param opts.initialBaseline Boundary cumulative counters for initial checkpoint.
 */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Root goal owner. */
    agentId: string;
    /** Trusted descendant capability from worker consume; never model-supplied. */
    authority?: types.goal.DelegationAuthority;
    /** Immutable goal identity. */
    goalId: string;
    /** Observed revision; reread and retry identical snapshot on conflict. */
    expectedRevision: number;
    /** Actual source worker claim token; root token only for root-source accounting. Flush before revocation. */
    runToken: string;
    /** Direct request producer, not subtree aggregate. */
    sourceAgentId: string;
    /** Source run identity. */
    runId: string;
    /** Stable checkpoint retry key. */
    checkpointId: string;
    /** Strictly increasing source sequence; serialize through commit. */
    sequence: number;
    /** Process monotonic clock epoch. */
    clockEpoch: string;
    /** Exact cumulative decimal i64 source counters. */
    current: {
        input: string;
        cached: string;
        output: string;
    };
    /** Unknown usage blocks before SQL. */
    quality: 'exact' | 'unknown' | 'unsupported';
    /** Goal captured at activation/delegation boundary. */
    boundaryGoalId: string;
    /** Explicit root subscription, not lineage. */
    boundaryRootAgentId: string;
    /** Monotonic capture timestamp. */
    nowMs: number;
    /** Initial source run monotonic baseline. */
    initialNowMs: number;
    /** Boundary cumulative counters for initial checkpoint. */
    initialBaseline: {
        input: string;
        cached: string;
        output: string;
    };
}): Promise<types.goal.AccountingResult> {
    if (!await ctx.fns.goal.enabled({})) throw new Error('Goal feature disabled');
    if (opts.quality !== 'exact') throw new Error('Goal usage unknown or unsupported: checkpoint blocked');
    return await ctx.fns.procs.db.transaction({ fn: async () => await ctx.fns.goal.accountingCheckpointTx({ ...opts }) }) as types.goal.AccountingResult;
}
