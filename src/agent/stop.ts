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
    const result = await ctx.fns.procs.db.transaction({ fn: async () => {
        const row = (await ctx.fns.procs.db.select({
            sql: 'SELECT scratchpad FROM agents WHERE id = ? FOR UPDATE', params: [agent.id],
        }))[0];
        if (!row) return null;
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
            params: [now, JSON.stringify(scratchpad), clearQueue ? 'stopped by user; queue cleared' : 'stopped by user', now, agent.id],
        });
        return { scratchpad };
    } });
    if (!result) return { ok: false, clearQueue };
    // Never erase controllers belonging to a concurrently resumed/replaced run.
    if (agent.abortController === controller) agent.abortController = null;
    if (agent.samplingAbortController === sampling) agent.samplingAbortController = null;
    if (agent.currentJobId === jobId) {
        agent.currentJobId = null;
        agent.isStreaming = false;
    }
    await ctx.fns.session.appendErrorEvent({ id: agent.id, error: clearQueue ? 'stopped by user; queue cleared' : 'stopped by user' });
    await ctx.fns.session.syncAgentState({ agent });
    ctx.fns.events.refreshAgentMeta({ agentId: agent.id, reason: 'stopped' });
    return { ok: true, clearQueue };
}
