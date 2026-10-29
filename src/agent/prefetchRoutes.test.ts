import { expect, test } from 'bun:test';
import agentRoute from './$route_$id_GET';
import llmsRoute from '../llms/$route__GET';
import chatColumn from '../ui/chatColumn';

const request = (path: string, header?: string) => new Request(`http://example.test${path}`, { headers: header === undefined ? {} : { 'X-Hyper-Prefetch': header } });

for (const header of [undefined, '1', '0', 'true']) {
    test(`agent GET prefetch=${header}: only exact opt-in suppresses recent visit`, async () => {
        const writes: any[] = [], chats: any[] = [];
        const ctx: any = { state: { agent: { ab: { id: 'ab', title: 'Chat' } } }, fns: {
            procs: { db: { run: async (o: any) => writes.push(o), select: async () => [] }, ui: { attr: () => '', escape: ({ text }: any) => text } },
            ui: { chatColumn: async (o: any) => { chats.push(o); return 'transcript'; }, agentSettingsBlocks: async () => [], agentMetaPanel: () => '', resourceMonitor: async () => '' },
            agent: { team: async () => [], triggers: async () => [] },
            canvas: { get: async () => ({ open: false, chatWidth: 440 }), panelHtml: async () => '' },
            settings: { getNumber: async () => 65 },
        } };
        const result: any = await agentRoute(ctx, null, { req: request('/agent/ab', header), params: { id: 'ab' } });
        expect(result.main).toContain('transcript');
        expect(chats).toEqual([{ agentId: 'ab', prefetch: header === '1' }]);
        expect(writes.length).toBe(header === '1' ? 0 : 1);
        if (writes.length) expect(writes[0].params[0]).toBe('hot:ab');
    });

    test(`llms GET prefetch=${header}: preserves snapshots without provider refresh`, async () => {
        let refreshes = 0;
        const snapshots = [{ provider: 'codex', account: 'default', usedPercent: null, updatedAt: 123, available: true }];
        let rendered: any;
        const ctx: any = { state: {}, fns: {
            procs: { ui: { escape: ({ text }: any) => Bun.escapeHTML(String(text ?? '')), button: () => '', heading: () => '' } },
            ui: { modelLogo: () => '', popup: () => '' },
            llm: { listAccounts: async () => snapshots, refreshUsage: async () => { refreshes++; }, accountLoginStatus: () => [], modelPolicy: async () => ({ disabledModels: [] }), listModels: async () => ({}), modelPrices: async () => ({}), codingInstance: async () => ({ instance: null }) },
            llms: { accountsCard: (o: any) => { rendered = o.accounts; return 'stored quota'; }, planInstanceSettings: () => '' },
            node: { list: async () => [], card: async () => '' }, sshInstance: { list: async () => [] },
            settings: { status: async () => ({ anthropicOAuth: { connected: false }, codex: { loggedIn: true }, kimiCoding: {}, openai: {}, anthropic: {}, openrouter: {} }), getString: async () => null },
        } };
        const result = await llmsRoute(ctx, null, { req: request('/llms', header), params: {} });
        expect(result.main).toContain('stored quota');
        expect(refreshes).toBe(header === '1' ? 0 : 1);
        expect(rendered).toEqual(snapshots);
        expect(rendered[0].usedPercent).toBeNull();
        expect(rendered[0].updatedAt).toBe(123);
    });
}

test('speculative chat rendering never marks unread messages seen', async () => {
    let marks = 0;
    const ctx: any = { state: {}, fns: { procs: { ui: { escape: ({ text }: any) => text } }, auth: { markSeen: async () => { marks++; } } } };
    await chatColumn(ctx, null, { agentId: 'missing', prefetch: true });
    expect(marks).toBe(0);
    await chatColumn(ctx, null, { agentId: 'missing' });
    expect(marks).toBe(1);
});
