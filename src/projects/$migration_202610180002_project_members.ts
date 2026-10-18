/** Personal project membership keeps explicitly added empty workspaces private. */
export default { async up(ctx: Context) {
 await ctx.fns.procs.db.exec({sql:`CREATE TABLE IF NOT EXISTS project_members (
 principal TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
 PRIMARY KEY(principal, project_id)
 );`});
} };
