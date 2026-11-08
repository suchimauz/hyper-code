import { expect, test } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';
import migration from './$migration_20331201190000_agent_mascot';
import expandMigration from './$migration_20331201191000_agent_mascot_eight';

const legacyChoices = ['crab', 'deepy', 'whalegirl'];
const choices = [...legacyChoices, 'desksprite', 'bitty', 'tmuxai', 'planet', 'rainbow-terminal-cat'];

test('mascot persists across saves, reloads and forks use the database default', async () => {
    const ctx = await mkTestCtx();
    const a = await ctx.fns.agent.start({ model: 'mock:echo' });
    await ctx.fns.session.save({ agent: a });
    const read = async (id: string) => (await ctx.fns.procs.db.select({ sql: 'SELECT mascot FROM agents WHERE id = ?', params: [id] }))[0].mascot;
    const initial = await read(a.id);
    expect(choices).toContain(initial);
    a.title = 'Renamed mascot';
    await ctx.fns.session.save({ agent: a });
    await ctx.fns.session.load({ id: a.id });
    expect(await read(a.id)).toBe(initial);
    // Force a distinct child default in this disposable DB to prove forks do not copy the parent.
    const childDefault = choices.find(value => value !== initial)!;
    await ctx.fns.procs.db.exec({ sql: `ALTER TABLE agents ALTER COLUMN mascot SET DEFAULT '${childDefault}'` });
    const child = await ctx.fns.session.fork({ id: a.id });
    expect(await read(child.id)).toBe(childDefault);
    expect(await read(a.id)).toBe(initial);
});

test('migration randomly backfills legacy agents once and enforces valid future defaults', async () => {
    const ctx = await mkTestCtx();
    expect(new URL(ctx.env.DATABASE_URL).pathname).toContain('hyper_test_');
    await ctx.fns.procs.db.exec({ sql: 'ALTER TABLE agents DROP COLUMN mascot' });
    await ctx.fns.procs.db.exec({ sql: `INSERT INTO agents (id, model, created_at, updated_at) SELECT 'mascot-old-' || i, 'mock:echo', 1, 1 FROM generate_series(1, 128) AS i` });
    await migration.up(ctx);
    const read = () => ctx.fns.procs.db.select({ sql: "SELECT id, mascot FROM agents WHERE id LIKE 'mascot-old-%' ORDER BY id" });
    const before = await read();
    expect(before).toHaveLength(128);
    expect(before.every((row: { mascot: string }) => legacyChoices.includes(row.mascot))).toBe(true);
    expect(new Set(before.map((row: { mascot: string }) => row.mascot)).size).toBe(3);
    await migration.up(ctx);
    expect(await read()).toEqual(before);
    await ctx.fns.procs.db.run({ sql: "INSERT INTO agents (id, model, created_at, updated_at) VALUES ('mascot-new', 'mock:echo', 1, 1)" });
    const [row] = await ctx.fns.procs.db.select({ sql: "SELECT mascot FROM agents WHERE id = 'mascot-new'" });
    expect(choices).toContain(row.mascot);
    await expect(ctx.fns.procs.db.run({ sql: "UPDATE agents SET mascot = 'invalid' WHERE id = 'mascot-new'" })).rejects.toThrow();
    await expect(ctx.fns.procs.db.run({ sql: "UPDATE agents SET mascot = NULL WHERE id = 'mascot-new'" })).rejects.toThrow();
});

test('eight-choice upgrade preserves existing assignments and is idempotent', async () => {
    const ctx = await mkTestCtx();
    expect(new URL(ctx.env.DATABASE_URL).pathname).toContain('hyper_test_');
    await ctx.fns.procs.db.exec({ sql: 'ALTER TABLE agents DROP COLUMN mascot' });
    await migration.up(ctx);
    for (const mascot of legacyChoices) {
        await ctx.fns.procs.db.run({ sql: 'INSERT INTO agents (id, model, created_at, updated_at, mascot) VALUES (?, ?, 1, 1, ?)', params: [`mascot-legacy-${mascot}`, 'mock:echo', mascot] });
    }
    const read = () => ctx.fns.procs.db.select({ sql: "SELECT id, mascot FROM agents WHERE id LIKE 'mascot-legacy-%' ORDER BY id" });
    const before = await read();
    await expandMigration.up(ctx);
    expect(await read()).toEqual(before);
    await expandMigration.up(ctx);
    expect(await read()).toEqual(before);
    await ctx.fns.procs.db.exec({ sql: `INSERT INTO agents (id, model, created_at, updated_at) SELECT 'mascot-eight-' || i, 'mock:echo', 1, 1 FROM generate_series(1, 1024) AS i` });
    const rows = await ctx.fns.procs.db.select({ sql: "SELECT mascot FROM agents WHERE id LIKE 'mascot-eight-%'" });
    expect(rows).toHaveLength(1024);
    expect(rows.every((row: { mascot: string }) => choices.includes(row.mascot))).toBe(true);
    expect(new Set(rows.map((row: { mascot: string }) => row.mascot)).size).toBe(8);
    for (const mascot of choices) {
        await ctx.fns.procs.db.run({ sql: "UPDATE agents SET mascot = ? WHERE id = 'mascot-eight-1'", params: [mascot] });
    }
    await expect(ctx.fns.procs.db.run({ sql: "UPDATE agents SET mascot = 'invalid' WHERE id = 'mascot-eight-1'" })).rejects.toThrow();
    await expect(ctx.fns.procs.db.run({ sql: "UPDATE agents SET mascot = NULL WHERE id = 'mascot-eight-1'" })).rejects.toThrow();
    const assigned = await ctx.fns.procs.db.select({ sql: "SELECT id, mascot FROM agents WHERE id LIKE 'mascot-eight-%' ORDER BY id" });
    await expandMigration.up(ctx);
    expect(await ctx.fns.procs.db.select({ sql: "SELECT id, mascot FROM agents WHERE id LIKE 'mascot-eight-%' ORDER BY id" })).toEqual(assigned);
});
