/**
 * Pause an active goal inside the user Stop transaction
 *
 * Transaction-only helper for the explicit user Stop path. Preserves non-active statuses and never cancels a process or schedules work. Call while the owner row is locked, before clearing its run token.
 * @param opts.agentId Agent explicitly stopped by its user.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent explicitly stopped by its user. */
        agentId: string;
        /** Captured running owner's token; mismatch skips pausing. Omit for an idle Stop. */
        expectedRunToken?: string;
        /** Immutable goal identity captured with the run; mismatch skips pausing. */
        expectedGoalId?: string;
    },
): Promise<{ paused: boolean; reason: string; revision?: number }> {
    if (!await ctx.fns.goal.enabled({})) return { paused: false, reason: 'disabled' };
    if (!ctx.state.procs?.db?.transactionStorage?.getStore()?.active) throw new Error('Goal pause requires active Stop transaction');
    const owner = (await ctx.fns.procs.db.select({ sql: 'SELECT id, run_token FROM agents WHERE id = ? FOR UPDATE', params: [opts.agentId] }))[0];
    if (!owner) return { paused: false, reason: 'missing_owner' };
    if (opts.expectedRunToken !== undefined && owner.run_token !== opts.expectedRunToken) return { paused: false, reason: 'fenced' };
    const result = await ctx.fns.goal.read({ agentId: opts.agentId });
    if (!result.enabled) return { paused: false, reason: 'disabled' };
    const goal = result.goal;
    if (opts.expectedGoalId !== undefined && goal?.goalId !== opts.expectedGoalId) return { paused: false, reason: 'fenced' };
    if (!goal || goal.status !== 'active') return { paused: false, reason: 'inactive' };
    const now = Date.now();
    const next = await ctx.fns.goal.transition({ current: goal, command: { kind: 'update', status: 'paused' }, expectedGoalId: goal.goalId, expectedRevision: goal.revision, now, newGoalId: goal.goalId, agentId: opts.agentId, maxTokenBudget: null });
    if (!next) throw new Error('Pause produced no state');
    const changed = await ctx.fns.procs.db.run({ sql: 'UPDATE agent_goals SET status = ?, revision = ?, updated_at = ? WHERE agent_id = ? AND goal_id = ?::uuid AND revision = ?', params: [next.status, next.revision, now, opts.agentId, goal.goalId, goal.revision] });
    if (changed.changes !== 1) throw new Error('Goal conflict during Stop');
    await ctx.fns.procs.db.run({ sql: 'INSERT INTO goal_transition_events(agent_id,goal_id,origin,before_revision,after_revision,before_status,after_status,run_token,created_at) VALUES (?,?::uuid,?,?,?,?,?,?,?)', params: [opts.agentId, goal.goalId, 'set', goal.revision, next.revision, goal.status, next.status, null, now] });
    return { paused: true, reason: 'user_stop', revision: next.revision };
}
