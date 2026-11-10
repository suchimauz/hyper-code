/** Remember the opt-in browser's user agent so the device list can show a readable name; null keeps the provider fallback. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `
ALTER TABLE web_push_subscriptions ADD COLUMN IF NOT EXISTS user_agent text;`});
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `
ALTER TABLE web_push_subscriptions DROP COLUMN IF EXISTS user_agent;`});
    },
};
