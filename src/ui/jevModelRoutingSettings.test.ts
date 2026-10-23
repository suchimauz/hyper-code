import { test, expect } from 'bun:test';
import render from './agentMetaSection';
import { renderCtx, spy } from './testRender.entry';

test('executor advice toggle defaults off and discloses explicit invocation, task/title sharing and no delegation', async () => {
    const toggle = spy('ui.toggle', (_c: any, _s: any, o: any) => `<input name="${o.name}">`);
    const ctx = await renderCtx(toggle.override);
    const html = render(ctx, null, { section: 'settings', agent: { id: 'test' } as any });
    const flag = toggle.calls.find((x: any) => x.name === 'jevModelRoutingEnabled')!;
    expect(flag.enabled).toBe(false);
    for(const phrase of ['task text','account-free model labels','configured Jev','outside the allowed','never switches models']) expect(html).toContain(phrase);
    expect(html).toContain('name="jevModelRoutingPresent" value="1"');
});
