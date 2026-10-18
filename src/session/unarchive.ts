/** Restore one archived conversation without starting queued work or altering schedules.
 * Preserves transcript, plan, result, workspace and parent relationship. Repeated restore is a no-op.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Archived conversation identifier to return to active lists. */
    id: string;
}): Promise<{ ok: boolean }> {
    const { id } = opts;
    const rows = await ctx.fns.procs.db.select({ sql: 'SELECT archived_at, run_state, next_run_at, wake_at FROM agents WHERE id = ?', params: [id] });
    if (!rows.length) return { ok: false };
    const row = rows[0];
    if (row.archived_at == null) return { ok: true };
    if (row.run_state === 'running' || Number(ctx.state.agent?.[id]?.activeRunCount ?? 0) > 0) {
        throw Object.assign(new Error('This chat is still running. Wait for it to finish before restoring.'), { code: 'busy' });
    }
    if (row.next_run_at != null || row.wake_at != null) {
        throw Object.assign(new Error('This archived chat has queued work or a scheduled wake. Explicitly stop queued work or cancel the wake before restoring to avoid an unexpected run.'), { code: row.wake_at != null ? 'scheduled' : 'queued' });
    }
    const res = await ctx.fns.procs.db.run({
        sql: "UPDATE agents SET archived_at = NULL WHERE id = ? AND archived_at IS NOT NULL AND run_state = 'idle' AND next_run_at IS NULL AND wake_at IS NULL",
        params: [id],
    });
    if (!res.changes) throw Object.assign(new Error('Chat state changed while restoring. Refresh and try again.'), { code: 'conflict' });
    await ctx.fns.events.emitAgentsChanged({ agentId: id, reason: 'unarchive' });
    return { ok: true };
}
