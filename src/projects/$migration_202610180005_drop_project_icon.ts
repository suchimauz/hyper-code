/** Workspace navigation shows folder icons only; personal project logos are no longer stored. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql:'ALTER TABLE project_members DROP COLUMN IF EXISTS icon'});
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.exec({sql:'ALTER TABLE project_members ADD COLUMN IF NOT EXISTS icon TEXT'});
    },
};
