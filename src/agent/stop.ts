/**
 * Stop an agent and durably pause all automatic restarts until a human resumes it.
 * Use for the Stop action, including agents without a plan or a loaded run.
 * Schedules remain configured but cannot execute while the stop marker is set.
 * @param opts.agent Agent whose current execution must be cancelled.
 * @param opts.clearQueue Discard the pending debounce window. Defaults to true; false retains it behind the durable pause.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Agent whose current execution must be cancelled. */
    agent: types.agent.Agent;
    /** Discard queued work as well as pausing execution. @default true */
    clearQueue?: boolean;
}): Promise<{ ok: boolean; clearQueue: boolean }> {
    const { agent } = opts;
    const clearQueue = opts.clearQueue !== false;
    const controller = agent.abortController;
    const sampling = agent.samplingAbortController;
    const jobId = agent.currentJobId;
    const toolRuns = ctx.fns.tools.runs({ agentId: agent.id });
    // Interrupt promptly; the row transaction below is the durable authority.
    sampling?.abort('stopped_by_user');
    controller?.abort('stopped_by_user');
    for (const run of toolRuns) ctx.fns.tools.abortRun({ id: run.id });
    let preparation: types.goal.StopPreparation = { kind: 'absent' };
    let preparationError: unknown;
    try {
        if (jobId) preparation = await ctx.fns.goal.runStopPrepare({ agentId: agent.id, runToken: jobId });
    } catch (error) { preparationError = error; }
    const baselineMessage = clearQueue ? 'stopped by user; queue cleared' : 'stopped by user';
    let diagnostic = preparation.kind === 'blocked' ? '; final goal usage incomplete: ' + preparation.reason : '';
    let checkpointResult: types.goal.AccountingResult | undefined;
    let checkpointFailed = preparationError !== undefined;
    if (checkpointFailed) diagnostic = '; final goal accounting failed (not exact): ' + String(preparationError);
    const authority = preparation.kind === 'absent' ? undefined : preparation.authority;
    const descendant = authority !== undefined && authority.rootAgentId !== agent.id;
    const unattributed = preparation.kind === 'ready' && preparation.snapshot.agentId !== undefined
        && preparation.snapshot.agentId !== agent.id && !descendant;
    if (unattributed) diagnostic = '; final goal usage incomplete: missing descendant authority';
    const commitStop = async (withGoal: boolean) => await ctx.fns.procs.db.transaction({ fn: async () => {
        // Bound both the accounting attempt and baseline fallback: never wait indefinitely
        // behind a worker that holds the child while waiting on an accounting root.
        await ctx.fns.procs.db.run({ sql: "SET LOCAL lock_timeout = '1000ms'" });
        if (withGoal && descendant) {
            try {
                await ctx.fns.procs.db.select({
                    sql: 'SELECT id FROM agents WHERE id = ? FOR UPDATE', params: [authority.rootAgentId],
                });
            } catch (error) { checkpointFailed = true; throw error; }
        }
        const row = (await ctx.fns.procs.db.select({
            sql: 'SELECT scratchpad FROM agents WHERE id = ? FOR UPDATE', params: [agent.id],
        }))[0];
        if (!row) return null;
        // Drain happened before this owner lock. Flush before pause and revocation.
        if (withGoal && !unattributed && preparation.kind === 'ready') {
            try {
                checkpointResult = await ctx.fns.goal.accountingCheckpointTx({ ...preparation.snapshot });
            } catch (error) { checkpointFailed = true; throw error; }
        }
        let pauseResult: { paused: boolean } = { paused: false };
        if (withGoal && !descendant && !unattributed) try { pauseResult = await ctx.fns.goal.lifecyclePause({ agentId: agent.id, expectedRunToken: jobId ?? undefined,
            ...(preparation.kind === 'absent' ? {} : { expectedGoalId: preparation.goalId }) });
        } catch (error) { checkpointFailed = true; throw error; }
        if (preparation.kind === 'absent' && jobId && pauseResult.paused)
            diagnostic = '; final goal usage unavailable: no run snapshot';
        const now = Date.now();
        const scratchpad = typeof row.scratchpad === 'string' ? JSON.parse(row.scratchpad || '{}') : (row.scratchpad ?? {});
        const plan = scratchpad.plan;
        if (plan && !plan.pausedAt) {
            const task = Array.isArray(plan.tasks) ? plan.tasks.find((item: { status?: string }) => item.status === 'active') : null;
            if (task?.activeSince) {
                task.elapsedMs = Math.max(0, Number(task.elapsedMs ?? 0)) + Math.max(0, now - Number(task.activeSince));
                task.activeSince = null;
            }
            plan.pausedAt = now;
            plan.updatedAt = now;
        }
        await ctx.fns.procs.db.run({
            sql: `UPDATE agents SET stopped_at = ?, scratchpad = ?, run_state = 'idle',
                run_started_at = NULL, run_heartbeat_at = NULL, run_token = NULL,
                next_run_at = ${clearQueue ? 'NULL' : 'next_run_at'}, last_error = ?, updated_at = ? WHERE id = ?`,
            params: [now, JSON.stringify(scratchpad), baselineMessage + diagnostic, now, agent.id],
        });
        return { scratchpad };
    } });
    let result: Awaited<ReturnType<typeof commitStop>>;
    try { result = await commitStop(!checkpointFailed); }
    catch (error) {
        if (!checkpointFailed) throw error;
        checkpointResult = undefined;
        diagnostic = '; final goal accounting failed (not exact): ' + String(error);
        result = await commitStop(false);
    }
    if (!result) return { ok: false, clearQueue };
    // Release the sealed handoff even after rollback; never advance failed counters.
    try { await ctx.fns.goal.runStopApply({ preparation, result: checkpointResult }); }
    catch (error) { diagnostic += '; local goal accounting cleanup failed: ' + String(error); }
    // Never erase controllers belonging to a concurrently resumed/replaced run.
    if (agent.abortController === controller) agent.abortController = null;
    if (agent.samplingAbortController === sampling) agent.samplingAbortController = null;
    if (agent.currentJobId === jobId) {
        agent.currentJobId = null;
        agent.isStreaming = false;
    }
    await ctx.fns.session.appendErrorEvent({ id: agent.id, error: baselineMessage + diagnostic });
    await ctx.fns.session.syncAgentState({ agent });
    ctx.fns.events.refreshAgentMeta({ agentId: agent.id, reason: 'stopped' });
    return { ok: true, clearQueue };
}
