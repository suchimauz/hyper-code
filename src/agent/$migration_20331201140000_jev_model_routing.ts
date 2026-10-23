/** Add independent off-by-default advisory model selection consent. */
export default {
    up: async (ctx: Context) => { await ctx.fns.procs.db.exec({ sql: 'ALTER TABLE agents ADD COLUMN jev_model_routing_enabled BOOLEAN NOT NULL DEFAULT FALSE' }); },
    down: async (ctx: Context) => { await ctx.fns.procs.db.exec({ sql: 'ALTER TABLE agents DROP COLUMN jev_model_routing_enabled' }); },
};
