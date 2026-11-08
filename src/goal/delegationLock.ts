/**
 * Lock and validate a live producer for a root-scoped accounting transaction
 *
 * Internal transaction-only helper. Feature gate precedes SQL. Locks root first and producer NOWAIT to avoid cross-root waits; contention must retry the entire immutable transaction. Idle roots are allowed, stopped roots fail closed without an accrued-usage cutoff. Does not schedule work.
 * @param opts.rootAgentId Immutable accounting owner.
 * @param opts.goalId Captured immutable goal identity.
 * @param opts.sourceAgentId Producer whose claim is validated.
 * @param opts.sourceRunToken Actual worker-issued claim token, also source run identity.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Immutable accounting owner. */
        rootAgentId: string;
        /** Captured immutable goal identity. */
        goalId: string;
        /** Producer whose claim is validated. */
        sourceAgentId: string;
        /** Actual worker-issued claim token, also source run identity. */
        sourceRunToken: string;
    },
): Promise<void> {
    if (!await ctx.fns.goal.enabled({})) throw new Error('Goal feature disabled');
    if (!ctx.state.procs?.db?.transactionStorage?.getStore()?.active) throw new Error('Delegation requires active framework transaction');
    if (!opts.rootAgentId || !opts.sourceAgentId || !opts.sourceRunToken || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opts.goalId)) throw new Error('Invalid delegation scope');
    const roots = await ctx.fns.procs.db.select({sql:'SELECT id,run_token,run_state,archived_at,stopped_at FROM agents WHERE id=? FOR UPDATE',params:[opts.rootAgentId]});
    const root=roots[0];
    if (!root || root.archived_at != null || root.stopped_at != null) throw new Error('Delegation root unavailable or stopped');
    const rows=opts.sourceAgentId===opts.rootAgentId ? roots : await ctx.fns.procs.db.select({sql:'SELECT id,run_token,run_state,archived_at,stopped_at FROM agents WHERE id=? FOR UPDATE NOWAIT',params:[opts.sourceAgentId]});
    const source=rows[0];
    if (!source || source.archived_at != null || source.stopped_at != null || source.run_state!=='running' || source.run_token!==opts.sourceRunToken) throw new Error('Delegation source claim revoked');
    const read=await ctx.fns.goal.read({agentId:opts.rootAgentId});
    if (!read.enabled || !read.goal || read.goal.goalId!==opts.goalId) throw new Error('Delegation goal identity changed');
}
