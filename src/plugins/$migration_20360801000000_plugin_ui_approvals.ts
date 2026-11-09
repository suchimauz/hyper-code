const upSql = `
CREATE TABLE IF NOT EXISTS plugin_ui_approvals (
    name TEXT PRIMARY KEY,
    hash TEXT NOT NULL,
    grants JSONB NOT NULL,
    approved_by TEXT,
    approved_at BIGINT NOT NULL
);
`;

/** Stores the human approval of one plugin UI bundle hash and its exact grants. */
export default {
    up: async (ctx: Context) => { await ctx.fns.procs.db.exec({ sql: upSql }); },
    down: async (ctx: Context) => { await ctx.fns.procs.db.exec({ sql: "DROP TABLE IF EXISTS plugin_ui_approvals" }); },
};
