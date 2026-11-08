/** Expand persistent mascot choices without changing any existing assignment; new agents sample all eight uniformly. */
export default {
    async up(ctx: Context) {
        // One atomic statement avoids a window with an unenforced constraint.
        // Repeating it is safe: no rows are updated and the same default/constraint are restored.
        await ctx.fns.procs.db.exec({ sql: `ALTER TABLE agents
            DROP CONSTRAINT IF EXISTS agents_mascot_check,
            ADD CONSTRAINT agents_mascot_check CHECK (mascot IN ('crab', 'deepy', 'whalegirl', 'desksprite', 'bitty', 'tmuxai', 'planet', 'rainbow-terminal-cat')),
            ALTER COLUMN mascot SET DEFAULT ((ARRAY['crab', 'deepy', 'whalegirl', 'desksprite', 'bitty', 'tmuxai', 'planet', 'rainbow-terminal-cat'])[1 + floor(random() * 8)::int])` });
    },
};
