/**
 * Set or reset one agent’s automatic compaction percentage.
 *
 * Use to persist an explicit context-window percentage for one agent, or null to inherit the current global value. Does not change the global token cap or invoke compaction.
 * @param opts.id Non-archived agent identifier.
 * @param opts.percent Explicit finite percentage from 30 through 95, or null to inherit the global setting.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Non-archived agent identifier. */
        id: string;
        /** Explicit finite percentage from 30 through 95, or null to inherit the global setting. */
        percent: number | null;
    },
): Promise<{ percent: number | null }> {
    const percent = opts.percent;
    if (percent !== null && (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 30 || percent > 95)) throw new Error('Compaction percentage must be a finite number from 30 to 95, or null to inherit.');
    const rows = await ctx.fns.procs.db.select({sql: 'UPDATE agents SET auto_compact_window_percent = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL RETURNING id', params: [percent, Date.now(), opts.id]});
    if (!rows.length) throw new Error('Agent not found: ' + opts.id);
    const live = ctx.state.agent?.[opts.id];
    if (live) live.autoCompactWindowPercent = percent;
    ctx.fns.events.refreshAgentMeta({agentId: opts.id, section: 'compaction', reason: 'compaction settings'});
    return { percent };
}
