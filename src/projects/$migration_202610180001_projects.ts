/** Add exact workspace projects and isolated personal tab state; never rewrite agents. */
export default { async up(ctx: Context) {
    await ctx.fns.procs.db.exec({sql: `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, host TEXT NOT NULL DEFAULT '', dir TEXT NOT NULL,
      title TEXT NOT NULL, created_at BIGINT NOT NULL, UNIQUE(host, dir)
    ); CREATE TABLE IF NOT EXISTS project_tabs (
      principal TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id),
      tab_ids JSONB NOT NULL DEFAULT '[]'::jsonb, active_id TEXT,
      revision INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(principal, project_id)
    );`});
} };
