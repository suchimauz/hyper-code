/** Widen the per-agent compaction range to 15–95 without changing existing values or NULL inheritance. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: `ALTER TABLE agents DROP CONSTRAINT agents_auto_compact_window_percent_check, ADD CONSTRAINT agents_auto_compact_window_percent_check CHECK (auto_compact_window_percent >= 15 AND auto_compact_window_percent <= 95)` });
    },
};
