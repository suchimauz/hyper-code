/** Add an independent, default-off opt-in for external Jev summary-preservation checks during compaction. */
export default {
    up: async (ctx: Context) => { await ctx.fns.procs.db.exec({ sql: 'ALTER TABLE agents ADD COLUMN jev_compaction_enabled BOOLEAN NOT NULL DEFAULT FALSE' }); },
    down: async (ctx: Context) => { await ctx.fns.procs.db.exec({ sql: 'ALTER TABLE agents DROP COLUMN jev_compaction_enabled' }); },
};
