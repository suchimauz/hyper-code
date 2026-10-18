/** Personal project archive state, independent of chat archive and execution. */
export default {
 async up(ctx: Context) {
  await ctx.fns.procs.db.exec({sql:'ALTER TABLE project_members ADD COLUMN IF NOT EXISTS archived_at BIGINT'});
 }
};
