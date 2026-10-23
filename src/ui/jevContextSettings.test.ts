import { test, expect } from 'bun:test';
import render from './agentMetaSection';
import { renderCtx, spy } from './testRender.entry';

test('context toggle discloses provider data sharing and stays independent of Function RAG', async () => {
    const toggle = spy('ui.toggle', (_c: any, _s: any, o: any) => `<input name="${o.name}">`);
    const ctx = await renderCtx(toggle.override);
    const html = render(ctx, null, { section: 'settings', agent: { id: 'test', functionRagEnabled: false } as any });
    const context = toggle.calls.find((x: any) => x.name === 'jevContextEnabled')!;
    expect(context.enabled).toBe(false);
    expect(context.title).toBeUndefined();
    expect(html).toContain('latest request and excerpts of old tool results');
    expect(html).toContain('configured Jev provider');
    expect(html).toContain('Independent of Function RAG');
    expect(html).toContain('Off by default');
    expect(html).toContain('name="jevContextPresent" value="1"');
});
