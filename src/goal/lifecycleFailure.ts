/**
 * Persist a fenced system failure transition in the worker finalization transaction
 *
 * Transaction-only helper called after final accounting and retry classification, before revoking the captured owner run token. Caller owns commit/rollback; never opens a nested transaction, schedules retries, pauses interrupted turns, or discovers a replacement goal. Admission guard failures are not execution errors and must not call this helper. Scheduled retries pass terminal=false. System audit uses the existing origin=set administrative status-write category (not a new system enum), and retains the captured run token for attribution. Caller must propagate errors so update and audit roll back together.
 * @param opts.agentId Captured goal owner ID, not a newly resolved owner.
 * @param opts.expectedGoalId Immutable goal ID captured for the failed run.
 * @param opts.expectedRunToken Immutable owner run token captured before execution; must still be valid.
 * @param opts.reason Trusted runtime error classification; admission rejection is not terminal_error.
 * @param opts.terminal Whether retry scheduling is exhausted or forbidden, as decided by the worker.
 * @param opts.codexPlanMode Actual execution Plan-mode flag, not the existence of a Hyper session.plan.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Captured goal owner ID, not a newly resolved owner. */
        agentId: string;
        /** Immutable goal ID captured for the failed run. */
        expectedGoalId: string;
        /** Immutable owner run token captured before execution; must still be valid. */
        expectedRunToken: string;
        /** Trusted runtime error classification; admission rejection is not terminal_error. */
        reason: "terminal_error" | "usage_limit" | "interrupted";
        /** Whether retry scheduling is exhausted or forbidden, as decided by the worker. */
        terminal: boolean;
        /** Actual execution Plan-mode flag, not the existence of a Hyper session.plan. */
        codexPlanMode: boolean;
    },
): Promise<{ changed: boolean; reason: string; revision?: number; status?: types.goal.State["status"] }> {
    if (!await ctx.fns.goal.enabled({})) return { changed: false, reason: 'disabled' };
    if (!opts.terminal || opts.codexPlanMode || opts.reason === 'interrupted') return { changed: false, reason: 'ineligible_outcome' };
    if (!opts.agentId || !opts.expectedGoalId || !opts.expectedRunToken) throw new Error('Goal failure requires captured identity');
    if (!ctx.state.procs?.db?.transactionStorage?.getStore()?.active) throw new Error('Goal failure requires active finalization transaction');
    const owner = (await ctx.fns.procs.db.select({sql:'SELECT id, run_token, run_state, archived_at FROM agents WHERE id = ? FOR UPDATE',params:[opts.agentId]}))[0];
    if (!owner || owner.run_token !== opts.expectedRunToken || owner.run_state !== 'running' || owner.archived_at != null) return { changed:false, reason:'fenced' };
    const rows = await ctx.fns.procs.db.select({sql:'SELECT goal_id AS "goalId", status, revision::float8 AS revision FROM agent_goals WHERE agent_id = ? AND goal_id = ?::uuid',params:[opts.agentId,opts.expectedGoalId]}) as Array<{goalId:string;status:types.goal.State["status"];revision:number}>;
    const goal = rows[0];
    if (!goal || goal.goalId !== opts.expectedGoalId) return {changed:false,reason:'fenced'};
    const status = await ctx.fns.goal.lifecycleFailureStatus({status:goal.status,reason:opts.reason,terminal:opts.terminal,codexPlanMode:opts.codexPlanMode});
    if (status === null) return {changed:false,reason:'preserved_status'};
    if (!Number.isSafeInteger(goal.revision) || !Number.isSafeInteger(goal.revision + 1)) throw new Error('Goal failure revision overflow');
    const revision = goal.revision + 1;
    const now = Date.now();
    const updated = await ctx.fns.procs.db.run({sql:'UPDATE agent_goals SET status = ?, revision = ?, updated_at = ? WHERE agent_id = ? AND goal_id = ?::uuid AND revision = ?',params:[status,revision,now,opts.agentId,opts.expectedGoalId,goal.revision]});
    if (updated.changes !== 1) throw new Error('Goal conflict during failure finalization');
    await ctx.fns.procs.db.run({sql:'INSERT INTO goal_transition_events(agent_id,goal_id,origin,before_revision,after_revision,before_status,after_status,run_token,created_at) VALUES (?,?::uuid,?,?,?,?,?,?,?)',params:[opts.agentId,opts.expectedGoalId,'set',goal.revision,revision,goal.status,status,opts.expectedRunToken,now]});
    return {changed:true,reason:opts.reason,revision,status};
}
