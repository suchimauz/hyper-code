/**
 * Checkpoint goal usage inside an existing owner transaction
 *
 * Transaction-only accounting helper for atomic Stop flush before token revocation and goal pause. Requires active framework transaction before SQL. Preserves exact same immutable token, attribution, identity, revision and deduplication guards as standalone accounting. Caller must await outer COMMIT before steering or advancing local baselines. Descendants require a trusted capability revalidated root-first in this transaction, including idle-root delivery.
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
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
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
    },
): Promise<types.goal.AccountingResult> {
    if (!ctx.state.procs?.db?.transactionStorage?.getStore()?.active) throw new Error('Goal checkpoint requires active transaction');
    
        if (!await ctx.fns.goal.enabled({}))
            throw new Error('Goal feature disabled');
        if (opts.quality !== 'exact')
            throw new Error('Goal usage unknown or unsupported: checkpoint blocked');
        if (opts.boundaryGoalId !== opts.goalId || opts.boundaryRootAgentId !== opts.agentId)
            throw new Error('Goal attribution boundary mismatch');
        if (!opts.runToken || !opts.runId || !opts.sourceAgentId || !opts.checkpointId || !opts.clockEpoch || !Number.isSafeInteger(opts.sequence) || opts.sequence < 0)
            throw new Error('Invalid checkpoint identity');
        await ctx.fns.goal.accountingDelta({ current: opts.current, baseline: opts.current });
        
                const authority=opts.authority;
                if(authority){
                    if(authority.rootAgentId!==opts.agentId || authority.goalId!==opts.goalId || authority.sourceAgentId!==opts.sourceAgentId || authority.sourceRunId!==opts.runId || opts.runId!==opts.runToken || opts.sourceAgentId===opts.agentId) throw new Error('Delegation accounting scope mismatch');
                    await ctx.fns.goal.delegationAuthorize({rootAgentId:opts.agentId,goalId:opts.goalId,sourceAgentId:opts.sourceAgentId,sourceRunId:opts.runId,sourceRunToken:opts.runToken,capabilityId:authority.capabilityId});
                } else if(opts.sourceAgentId!==opts.agentId) throw new Error('Descendant accounting requires capability');
                const owners = await ctx.fns.procs.db.select({ sql: 'SELECT id, run_token, run_state, archived_at FROM agents WHERE id = ? FOR UPDATE', params: [opts.agentId] }) as Array<{
                    run_token: string | null;
                    run_state: string;
                    archived_at: number | null;
                }>;
                const owner = owners[0];
                if (!owner || owner.archived_at != null || !authority && (owner.run_token !== opts.runToken || owner.run_state !== 'running'))
                    throw new Error('Goal conflict: stale or inactive run');
                const scope = [opts.agentId, opts.goalId, opts.sourceAgentId, opts.runId];
                const duplicates = await ctx.fns.procs.db.select({ sql: 'SELECT snapshot,result FROM goal_usage_checkpoints WHERE agent_id=? AND goal_id=?::uuid AND source_agent_id=? AND run_id=? AND checkpoint_id=?', params: [...scope, opts.checkpointId] }) as Array<{
                    snapshot: types.goal.AccountingSnapshot;
                    result: types.goal.AccountingResult;
                }>;
                const read = await ctx.fns.goal.read({ agentId: opts.agentId });
                const goal = read.enabled ? read.goal : null;
                if (!read.enabled || !goal || goal.goalId !== opts.goalId)
                    throw new Error('Goal conflict: identity changed');
                if (duplicates[0]) {
                    const saved = duplicates[0];
                    if (saved.snapshot.sequence !== opts.sequence || (['input', 'cached', 'output'] as const).some(key => saved.snapshot.current[key] !== opts.current[key]) || saved.snapshot.nowMs !== opts.nowMs || saved.snapshot.clockEpoch !== opts.clockEpoch || saved.snapshot.authority?.capabilityId !== authority?.capabilityId)
                        throw new Error('Checkpoint key reused with different snapshot');
                    return { ...saved.result, duplicate: true, budgetTransition: false };
                }
                if (goal.revision !== opts.expectedRevision)
                    throw new Error('Goal conflict: revision changed; reread and retry same immutable snapshot');
                const rows = await ctx.fns.procs.db.select({ sql: 'SELECT snapshot FROM goal_usage_checkpoints WHERE agent_id=? AND goal_id=?::uuid AND source_agent_id=? AND run_id=? ORDER BY id DESC LIMIT 1', params: scope }) as Array<{
                    snapshot: types.goal.AccountingSnapshot;
                }>;
                const previous = rows[0]?.snapshot;
                if (previous && opts.sequence <= previous.sequence)
                    throw new Error('Out of order cumulative snapshot');
                const baseline = previous?.current ?? opts.initialBaseline;
                if (!baseline)
                    throw new Error('Initial cumulative baseline required');
                const delta = await ctx.fns.goal.accountingDelta({ current: opts.current, baseline });
                // The owner lock serializes goal-scoped carry across runs. Token baselines remain per-run.
                const rootSource = opts.sourceAgentId === opts.agentId;
                let elapsed = { seconds: 0, baselineMs: opts.nowMs };
                if (rootSource) {
                    const clocks = await ctx.fns.procs.db.select({ sql: 'SELECT goal_id,clock_epoch,remainder_ms FROM goal_elapsed_carry WHERE agent_id=?', params: [opts.agentId] }) as Array<{goal_id:string;clock_epoch:string;remainder_ms:number}>;
                    const clock = clocks[0];
                    const sameClock = clock?.goal_id === opts.goalId && clock.clock_epoch === opts.clockEpoch;
                    const restore = !!previous && previous.clockEpoch !== opts.clockEpoch;
                    // Legacy receipts without carry retain their fractional baseline exactly once.
                    // Once carry exists, nowMs is the consumed timestamp: baselineMs would double count.
                    elapsed = await ctx.fns.goal.accountingElapsed({
                        nowMs: opts.nowMs,
                        baselineMs: previous ? (clock ? previous.nowMs : previous.baselineMs) : opts.initialNowMs,
                        carryMs: sameClock ? Number(clock.remainder_ms) : 0,
                        restore,
                    });
                }
                const seconds = elapsed.seconds;
                const tokens = BigInt(goal.tokensUsed) + BigInt(delta.increment), time = BigInt(goal.timeUsedSeconds) + BigInt(seconds);
                if (tokens > BigInt(Number.MAX_SAFE_INTEGER) || time > BigInt(Number.MAX_SAFE_INTEGER) || !Number.isSafeInteger(goal.revision + 1))
                    throw new Error('Goal core safe integer capacity exceeded');
                const budgetTransition = goal.status === 'active' && goal.tokenBudget !== null && tokens >= BigInt(goal.tokenBudget);
                const status = budgetTransition ? 'budget_limited' : goal.status;
                const result: types.goal.AccountingResult = { duplicate: false, revision: goal.revision + 1, status, tokensUsed: Number(tokens), timeUsedSeconds: Number(time), increment: delta.increment, elapsedSeconds: seconds, budgetTransition };
                const changed = await ctx.fns.procs.db.run({ sql: 'UPDATE agent_goals SET tokens_used=?,time_used_seconds=?,status=?,revision=?,updated_at=? WHERE agent_id=? AND goal_id=?::uuid AND revision=?', params: [result.tokensUsed, result.timeUsedSeconds, status, result.revision, Date.now(), opts.agentId, opts.goalId, goal.revision] }) as {
                    changes: number;
                };
                if (changed.changes !== 1)
                    throw new Error('Goal conflict during checkpoint');
                if (rootSource) {
                    await ctx.fns.procs.db.run({ sql: 'INSERT INTO goal_elapsed_carry(agent_id,goal_id,clock_epoch,remainder_ms) VALUES (?,?::uuid,?,?) ON CONFLICT(agent_id) DO UPDATE SET goal_id=EXCLUDED.goal_id,clock_epoch=EXCLUDED.clock_epoch,remainder_ms=EXCLUDED.remainder_ms', params: [opts.agentId,opts.goalId,opts.clockEpoch,opts.nowMs-elapsed.baselineMs] });
                }
                const snapshot: types.goal.AccountingSnapshot = { ...(authority ? {authority:Object.freeze({...authority})}:{}), current: { ...opts.current }, sequence: opts.sequence, clockEpoch: opts.clockEpoch, nowMs: opts.nowMs, baselineMs: elapsed.baselineMs };
                await ctx.fns.procs.db.run({ sql: 'INSERT INTO goal_usage_checkpoints(agent_id,goal_id,source_agent_id,run_id,checkpoint_id,sequence,snapshot,result) VALUES (?,?::uuid,?,?,?,?,?::jsonb,?::jsonb)', params: [...scope, opts.checkpointId, opts.sequence, JSON.stringify(snapshot), JSON.stringify(result)] });
                return result;
}
