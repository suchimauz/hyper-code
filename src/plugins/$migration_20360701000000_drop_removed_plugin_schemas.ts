/** Drops the empty schemas left behind by removed official plugins (flow, hackernews, inbox, knowledge, news, rss, substack, tasks). */
const schemas = ["flow", "hackernews", "inbox", "knowledge", "news", "rss", "substack", "tasks"];

export default {
    async up(ctx: Context) {
        for (const schema of schemas) {
            await ctx.fns.procs.db.exec({ sql: `DROP SCHEMA IF EXISTS "${schema}" CASCADE` });
        }
    },
};
