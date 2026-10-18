/** Archive one idle conversation without deleting its history, live state, or schedules.
 * Rejects active runs and pending work; callers must explicitly stop work first.
 * Repeated archival succeeds without changing the original archive timestamp. Does not cascade to children.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Conversation identifier to hide from active lists. */
    id: string;
}): Promise<{ ok: boolean }> {
    const { id } = opts;
    const rows = await ctx.fns.procs.db.select({ sql: 'SELECT archived_at, run_state, next_run_at, wake_at FROM agents WHERE id = ?', params: [id] });
    if (!rows.length) return { ok: false };
    const row = rows[0];
    if (row.archived_at != null) return { ok: true };
    if (row.run_state === 'running' || Number(ctx.state.agent?.[id]?.activeRunCount ?? 0) > 0) {
        throw Object.assign(new Error('This chat is running. Wait for it to finish or explicitly stop it before archiving.'), { code: 'busy' });
    }
    if (row.next_run_at != null || row.wake_at != null) {
        throw Object.assign(new Error('This chat has queued work or a scheduled wake. Explicitly stop queued work or cancel the wake before archiving.'), { code: row.wake_at != null ? 'scheduled' : 'queued' });
    }
    const res = await ctx.fns.procs.db.run({
        sql: "UPDATE agents SET archived_at = ? WHERE id = ? AND archived_at IS NULL AND run_state = 'idle' AND next_run_at IS NULL AND wake_at IS NULL",
        params: [Date.now(), id],
    });
    if (!res.changes) throw Object.assign(new Error('Chat state changed while archiving. Refresh and try again.'), { code: 'conflict' });
    // Keep the cache: workspace and other live-only state must survive archive/restore.
    await ctx.fns.events.emitAgentsChanged({ agentId: id, reason: 'archive' });
    return { ok: true };
}
