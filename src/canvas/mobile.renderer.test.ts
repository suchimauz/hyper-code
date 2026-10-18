import { expect, test } from 'bun:test';
import panelHtml from './panelHtml';

test('Canvas renderer keeps kind content and adds escaped mobile native tab controls', async () => {
    const items = [{ id: 1, active: true, title: 'One <title>', kind: 'html', createdAt: Date.now(), args: {}, state: {} }];
    const ctx: any = { fns: { procs: { ui: { escape: ({ text }: any) => Bun.escapeHTML(text), button: () => '<button>action</button>' } }, canvas: { list: async () => items, revision: async () => ({ panel: 'p', body: 'b' }) } }, state: { canvas: { kinds: { html: { icon: 'file', render: async () => '<iframe src="about:blank"></iframe>' } } } } };
    const html = await panelHtml(ctx, null, { agentId: 'test' });
    expect(html).toContain('canvas-mobile-back');
    expect(html).toContain('data-canvas-mobile-tabs');
    expect(html).toContain('One &lt;title&gt;');
    expect(html).toContain('<iframe');
});
