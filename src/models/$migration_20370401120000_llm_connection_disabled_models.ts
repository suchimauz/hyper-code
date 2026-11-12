/** Add per-connection disabled model ids; inference through models.stream/compact refuses them. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `ALTER TABLE llm_connections ADD COLUMN IF NOT EXISTS disabled_models TEXT[] NOT NULL DEFAULT '{}'`});
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `ALTER TABLE llm_connections DROP COLUMN IF EXISTS disabled_models`});
    },
};
