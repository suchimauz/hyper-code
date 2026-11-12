/**
 * Return to the queue every running agent run owned by another server process instance.
 *
 * Call right after this process acquires the agent worker lock: only the lock holder runs agents, so a run still marked running by a different instance belongs to a holder that is gone. Recovers those runs immediately instead of waiting for the 10-minute heartbeat lease, with the same accounting as stale recovery: increments stale_recovery_count, schedules a retry with bounded exponential backoff (5 s doubling, max 2 min) up to 3 attempts, leaves stopped agents unscheduled and records a failure notification at the limit. Runs of the given owner and legacy runs without an owner are left alone.
 * @param opts.owner Instance identifier of the calling process (agent.instanceId); its own runs are never recovered.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Instance identifier of the calling process (agent.instanceId); its own runs are never recovered. */
        owner: string;
    },
): Promise<Array<{ id: string; previousOwner: string; retryScheduled: boolean }>> {
    const now = Date.now();
    const owner = String(opts.owner ?? '').trim();
    if (!owner) throw new Error('recoverOrphanedRuns: owner is required');
    const maxRetries = 3;
    // Same retry accounting as lease-based stale recovery in agent.workerLoop (keep both in step).
    const recovered = await ctx.fns.procs.db.select({
        sql: `WITH orphaned AS (
            SELECT id, run_token AS failed_token, run_owner AS failed_owner FROM agents
            WHERE run_state = 'running' AND run_owner IS NOT NULL AND run_owner <> ?
            FOR UPDATE
        ) UPDATE agents
            SET run_state = 'idle', run_started_at = NULL,
                run_heartbeat_at = NULL, run_token = NULL, run_owner = NULL,
                stale_recovery_count = stale_recovery_count + 1,
                next_run_at = CASE WHEN stopped_at IS NULL AND stale_recovery_count < ?
                    THEN ? + LEAST(120000, 5000 * CAST(power(2, stale_recovery_count) AS BIGINT))
                    ELSE NULL END,
                last_error = CASE WHEN stale_recovery_count < ?
                    THEN 'orphaned run recovered (owner process gone); automatic retry scheduled'
                    ELSE 'orphaned run recovered (owner process gone); automatic retry limit reached' END,
                updated_at = ?
          FROM orphaned WHERE agents.id = orphaned.id
          RETURNING agents.id, orphaned.failed_token, orphaned.failed_owner, agents.next_run_at`,
        params: [owner, maxRetries, now, maxRetries, now],
    }) as Array<{ id: string; failed_token: string | null; failed_owner: string; next_run_at: number | string | null }>;
    for (const row of recovered) {
        const live = (ctx.state as any).agent?.[row.id];
        if (live) live.currentJobId = null;
        try { live?.abortController?.abort('orphaned_run_recovered'); } catch {}
        if (row.failed_token && row.next_run_at == null) {
            await ctx.fns.webPush.recordFailure({ agentId: row.id, runToken: row.failed_token, finalizedAt: now });
        }
    }
    if (recovered.length) {
        ctx.fns.procs.log.warn({ event: 'agent.worker.orphansRecovered', msg: `recovered ${recovered.length} orphaned run(s) of a previous worker` });
        try { ctx.fns.agent.wakeWorker({}); } catch {}
    }
    return recovered.map((row) => ({ id: row.id, previousOwner: row.failed_owner, retryScheduled: row.next_run_at != null }));
}
