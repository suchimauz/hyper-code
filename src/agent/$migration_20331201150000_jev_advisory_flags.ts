/** Add four independent off-by-default consents for explicit advisory Jev calls. */
export default {
    up: async (ctx: Context) => { await ctx.fns.procs.db.exec({ sql: 'ALTER TABLE agents ADD COLUMN jev_evidence_enabled BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN jev_file_ranking_enabled BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN jev_result_review_enabled BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN jev_risk_review_enabled BOOLEAN NOT NULL DEFAULT FALSE' }); },
    down: async (ctx: Context) => { await ctx.fns.procs.db.exec({ sql: 'ALTER TABLE agents DROP COLUMN jev_evidence_enabled, DROP COLUMN jev_file_ranking_enabled, DROP COLUMN jev_result_review_enabled, DROP COLUMN jev_risk_review_enabled' }); },
};
