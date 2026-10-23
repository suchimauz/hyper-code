/** Adds an independent, off-by-default opt-in for Jev context filtering. */
export default {
    up: async (ctx: Context) => { await ctx.fns.procs.db.exec({ sql: "ALTER TABLE agents ADD COLUMN jev_context_enabled BOOLEAN NOT NULL DEFAULT FALSE" }); },
    down: async (ctx: Context) => { await ctx.fns.procs.db.exec({ sql: "ALTER TABLE agents DROP COLUMN jev_context_enabled" }); },
};
