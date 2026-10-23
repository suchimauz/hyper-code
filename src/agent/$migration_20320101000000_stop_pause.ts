/** Preserve an explicit human Stop independently of error text and plan state. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: `ALTER TABLE agents ADD COLUMN IF NOT EXISTS stopped_at BIGINT;
            UPDATE agents SET stopped_at = updated_at, next_run_at = NULL
            WHERE stopped_at IS NULL AND last_error LIKE 'stopped by user%';` });
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: 'ALTER TABLE agents DROP COLUMN IF EXISTS stopped_at' });
    },
};
