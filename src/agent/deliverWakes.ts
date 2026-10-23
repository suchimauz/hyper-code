/**
 * Deliver due legacy wake-ups only while the target agent is not stopped.
 * Hold the agent row lock through wake consumption, transcript append and scheduling,
 * so Stop cannot race delivery. Stopped agents retain their pending wake-up.
 * @param opts.now Current epoch milliseconds. @default Date.now()
 * @param opts.limit Maximum due agents to inspect. @default 10 @minimum 1 @maximum 20
 */
export default async function (ctx: Context, _session: Session | null, opts?: {
    /** Current epoch milliseconds. @default Date.now() */
    now?: number;
    /** Maximum due agents to inspect. @default 10 @minimum 1 @maximum 20 */
    limit?: number;
}): Promise<{ delivered: string[] }> {
    const now = Math.floor(opts?.now ?? Date.now());
    const limit = Math.max(1, Math.min(20, opts?.limit ?? 10));
    const rows = await ctx.fns.procs.db.select({
        sql: `SELECT id FROM agents WHERE wake_at IS NOT NULL AND wake_at <= ?
              AND archived_at IS NULL AND stopped_at IS NULL ORDER BY wake_at ASC LIMIT ?`,
        params: [now, limit],
    }) as { id: string }[];
    const delivered: string[] = [];
    for (const candidate of rows) {
        const id = String(candidate.id);
        const didDeliver = await ctx.fns.procs.db.transaction({ fn: async () => {
            const row = (await ctx.fns.procs.db.select({
                sql: `SELECT id, wake_reason FROM agents WHERE id = ? AND wake_at IS NOT NULL
                      AND wake_at <= ? AND archived_at IS NULL AND stopped_at IS NULL FOR UPDATE`,
                params: [id, now],
            }) as { id: string; wake_reason: string | null }[])[0];
            if (!row) return false;
            const reason = String(row.wake_reason ?? "Scheduled wake-up");
            await ctx.fns.procs.db.run({
                sql: `UPDATE agents SET wake_at = NULL, wake_reason = NULL,
                      next_run_at = COALESCE(next_run_at, ?), updated_at = ? WHERE id = ?`,
                params: [now, now, id],
            });
            // Preserve quota-parking behavior, but only under the stopped-agent guard.
            await ctx.fns.agent.unpark({ id, reason: "wake", resume: false });
            const message = await ctx.fns.session.appendMessage({ id, message: {
                role: "user", content: `Wake-up: ${reason}`, message_type: "wake_up", excluded_from_cursor: true,
            } });
            await ctx.fns.session.appendEvent({ id, event: { type: "wake_up", reason, messageIdx: message.idx } });
            return true;
        } });
        if (!didDeliver) continue;
        const agent = ctx.state.agent?.[id];
        if (agent) await ctx.fns.session.syncAgentState({ agent });
        ctx.fns.events.refreshAgentMeta({ agentId: id, section: "wake", reason: "wake-delivered" });
        delivered.push(id);
    }
    if (delivered.length) ctx.fns.agent.wakeWorker({});
    return { delivered };
}
