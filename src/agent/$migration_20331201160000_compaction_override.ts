/** Add an optional per-agent context-window percentage; NULL follows global settings. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: `ALTER TABLE agents ADD COLUMN IF NOT EXISTS auto_compact_window_percent DOUBLE PRECISION DEFAULT NULL CHECK (auto_compact_window_percent >= 30 AND auto_compact_window_percent <= 95)` });
    },
};
