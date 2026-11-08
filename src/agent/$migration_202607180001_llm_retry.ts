/** Persist model retry attempts and pending waits across worker recovery. */
export default { async up(ctx: Context) {
    await ctx.fns.procs.db.exec({ sql: `ALTER TABLE agents ADD COLUMN IF NOT EXISTS llm_retry_attempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS llm_retry_pending JSONB;` });
} };
