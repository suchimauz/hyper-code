import { describe, expect, test } from 'bun:test';
// Load native renderers into a tiny read-only fixture: no database boot or migrations.
async function fixtureCtx(): Promise<any> {
    const ctx: any = { fns: { procs: { db: {}, ui: {} }, dock: {}, chat: {}, ui: {} } };
    for (const [namespace, name, path] of [
        ['dock', 'runningAgents', './runningAgents.ts'],
        ['chat', 'icon', '../chat/icon.ts'],
        ['ui', 'live', '../ui/live.ts'],
        ['procs.ui', 'button', '../procs/ui/button.ts'],
        ['procs.ui', 'attr', '../procs/ui/attr.ts'],
        ['procs.ui', 'escape', '../procs/ui/escape.ts'],
    ]) {
        const fn = (await import(path!)).default;
        const target = namespace!.split('.').reduce((obj: any, key: string) => obj[key], ctx.fns);
        target[name!] = (opts: object) => fn(ctx, null, opts);
    }
    ctx.fns.ui.modelLogo = () => '<span class="model-logo"></span>';
    return ctx;
}

describe('dock.runningAgents', () => {
    test('reads all running nav rows and draws native horizontal icons', async () => {
        const ctx: any = await fixtureCtx();
        let query = '';
        // Fixtures replace only the database read; no persisted chat is changed.
        ctx.fns.procs.db.select = async ({ sql }: { sql: string }) => {
            query = sql;
            return Array.from({ length: 501 }, (_, i) => ({ id: `fixture-${i}`, title: '<Running & chat>', model: 'test', icon: null }));
        };
        const html = await ctx.fns.dock.runningAgents({});
        expect(query).toContain("archived_at IS NULL AND visibility = 'nav'");
        expect(query).toContain("NULLIF(TRIM(run_state), '') IS NOT NULL");
        expect(query).toContain("run_state <> 'idle'");
        expect(query.toLowerCase()).not.toContain('limit');
        expect(html).toContain('id="dock-running-agents"');
        expect(html).toContain('data-live-topic="agents"');
        expect(html).toContain('every 5s');
        expect(html).toContain('hx-target="this"');
        expect(html).toContain('class="dock-running-list"');
        expect(html).not.toContain('overflow-x-auto');
        expect(html).toContain('chat-icon-ring');
        expect(html).toContain('/agent/fixture-500');
        expect(html).not.toContain('<Running & chat>');
        expect(html).toContain('&lt;Running &amp; chat&gt;');
    });

    test('start and stop are reflected by successive read-only region renders', async () => {
        const ctx: any = await fixtureCtx();
        let running = false;
        ctx.fns.procs.db.select = async () => running ? [{ id: 'fixture', title: 'Fixture', icon: null, model: 'test' }] : [];
        expect(await ctx.fns.dock.runningAgents({})).toContain('No running chats');
        running = true;
        const active = await ctx.fns.dock.runningAgents({});
        expect(active).toContain('/agent/fixture');
        expect(active).not.toContain('No running chats');
        running = false;
        const idle = await ctx.fns.dock.runningAgents({});
        expect(idle).toContain('No running chats');
        expect(idle).not.toContain('/agent/fixture');
    });
});
