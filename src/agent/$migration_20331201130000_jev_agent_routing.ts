/** Adds the off-by-default advisory executor recommendation opt-in. */
export default {
    up: async (ctx: Context) => { await ctx.fns.procs.db.exec({ sql: "ALTER TABLE agents ADD COLUMN jev_agent_routing_enabled BOOLEAN NOT NULL DEFAULT FALSE" }); },
    down: async (ctx: Context) => { await ctx.fns.procs.db.exec({ sql: "ALTER TABLE agents DROP COLUMN jev_agent_routing_enabled" }); },
};
