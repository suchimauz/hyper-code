/** Personal project logos share the chat SVG sanitizer and membership boundary. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql:'ALTER TABLE project_members ADD COLUMN IF NOT EXISTS icon TEXT'});
    },
};
