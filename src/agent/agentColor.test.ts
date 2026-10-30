import { expect, test } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';
import migration from './$migration_20331201180000_agent_color';

test('random agent colors survive saves and reloads and both directions use the sender', async () => {
    const ctx = await mkTestCtx();
    const a = await ctx.fns.agent.start({ model: 'mock:echo' });
    const b = await ctx.fns.agent.start({ model: 'mock:echo' });
    await ctx.fns.session.save({ agent: a });
    await ctx.fns.session.save({ agent: b });
    const author = () => ctx.fns.auth.author({ userId: 'agent:' + a.id });
    const initial = await author();
    expect(initial.hue).toBeGreaterThanOrEqual(0);
    expect(initial.hue).toBeLessThan(360);
    a.title = 'Renamed sender';
    await ctx.fns.session.save({ agent: a });
    expect((await author()).hue).toBe(initial.hue);
    await ctx.fns.session.load({ id: a.id });
    expect((await author()).hue).toBe(initial.hue);
    // Deliberately distinct persisted hues prove this is not an ID hash or recipient color.
    await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET color_hue = CASE WHEN id = ? THEN 17.5 ELSE 241.25 END WHERE id IN (?, ?)', params: [a.id, a.id, b.id] });
    expect((await author()).hue).toBe(17.5);
    const incoming = await ctx.fns.agent.renderPeerMessageHtml({ agentId: b.id, event: { agentMessage: { from: a.id, body: 'hello' } } });
    const outgoing = await ctx.fns.agent.renderPeerMessageHtml({ agentId: a.id, event: { outgoingAgentMessage: { deliveryKey: 'color-test', to: b.id, body: 'hello', status: 'delivered', messageIdx: 0 } } });
    expect(incoming).toContain('--service-hue:17.5');
    expect(outgoing).toContain('--service-hue:17.5');
    const reply = await ctx.fns.agent.renderPeerMessageHtml({ agentId: a.id, event: { agentMessage: { from: b.id, body: 'reply' } } });
    expect(reply).toContain('--service-hue:241.25');
    expect((await ctx.fns.auth.author({ userId: 'agent:missing-color-test' })).hue).toBe(210);
});

test('migration backfills each legacy agent independently and future inserts get their own color', async () => {
    const ctx = await mkTestCtx();
    expect(new URL(ctx.env.DATABASE_URL).pathname).toContain('hyper_test_');
    // Reconstruct the old schema only in the disposable test database.
    await ctx.fns.procs.db.exec({ sql: 'ALTER TABLE agents DROP COLUMN color_hue' });
    await ctx.fns.procs.db.exec({ sql: `INSERT INTO agents (id, model, created_at, updated_at) SELECT 'color-old-' || i, 'mock:echo', 1, 1 FROM generate_series(1, 64) AS i` });
    await migration.up(ctx);
    const read = () => ctx.fns.procs.db.select({ sql: "SELECT id, color_hue FROM agents WHERE id LIKE 'color-old-%' ORDER BY id" });
    const before = await read();
    expect(before).toHaveLength(64);
    expect(before.every((r: { color_hue: number }) => r.color_hue >= 0 && r.color_hue < 360)).toBe(true);
    expect(new Set(before.map((r: { color_hue: number }) => r.color_hue)).size).toBeGreaterThan(60);
    await migration.up(ctx);
    expect(await read()).toEqual(before);
    await ctx.fns.procs.db.run({ sql: "INSERT INTO agents (id, model, parent_id, created_at, updated_at) VALUES ('color-new-child', 'mock:echo', 'color-old-1', 1, 1)" });
    const [child] = await ctx.fns.procs.db.select({ sql: "SELECT color_hue FROM agents WHERE id = 'color-new-child'" });
    expect(child.color_hue).toBeGreaterThanOrEqual(0);
    expect(child.color_hue).toBeLessThan(360);
    expect(before.some((r: { color_hue: number }) => r.color_hue === child.color_hue)).toBe(false);
    await expect(ctx.fns.procs.db.run({ sql: "UPDATE agents SET color_hue = 360 WHERE id = 'color-new-child'" })).rejects.toThrow();
});
