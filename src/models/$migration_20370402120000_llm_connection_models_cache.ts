/** Persistent per-connection model list cache; refreshed manually or hourly, never expired. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `ALTER TABLE llm_connections ADD COLUMN IF NOT EXISTS models_cache JSONB;
        ALTER TABLE llm_connections ADD COLUMN IF NOT EXISTS models_cached_at BIGINT`});
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `ALTER TABLE llm_connections DROP COLUMN IF EXISTS models_cache;
        ALTER TABLE llm_connections DROP COLUMN IF EXISTS models_cached_at`});
    },
};
