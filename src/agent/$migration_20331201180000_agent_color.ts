/** Give every existing and future agent a persistent random hue, independent of its ID or parent. */
export default {
    async up(ctx: Context) {
        // PostgreSQL evaluates the volatile default separately for every existing row.
        // Keeping allocation in the schema also covers forks, imports and direct inserts.
        // Session upserts deliberately omit this column, so later saves preserve the hue.
        await ctx.fns.procs.db.exec({ sql: `ALTER TABLE agents ADD COLUMN IF NOT EXISTS color_hue DOUBLE PRECISION NOT NULL DEFAULT (random() * 360) CHECK (color_hue >= 0 AND color_hue < 360)` });
    },
};
