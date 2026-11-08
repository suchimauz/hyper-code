/** Assign every existing and future agent a persistent random mascot, independently of its parent. */
export default {
    async up(ctx: Context) {
        // The volatile default is evaluated per existing row and per new INSERT.
        // Session saves omit this column so renames, forks and reloads never reroll it.
        await ctx.fns.procs.db.exec({ sql: `ALTER TABLE agents ADD COLUMN IF NOT EXISTS mascot TEXT NOT NULL DEFAULT ((ARRAY['crab', 'deepy', 'whalegirl'])[1 + floor(random() * 3)::int]) CHECK (mascot IN ('crab', 'deepy', 'whalegirl'))` });
    },
};
