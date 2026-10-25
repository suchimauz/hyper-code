import { test, expect } from 'bun:test';
import render from './agentMetaSection';
import { renderCtx, spy } from './testRender.entry';

test('compaction review is independent, default off and discloses automatic external transfer and limits', async () => {
    const toggle = spy('ui.toggle', (_c: any, _s: any, o: any) => `<input name="${o.name}">`);
    const ctx = await renderCtx(toggle.override);
    const html = render(ctx, null, { section: 'settings', agent: { id: 'test', functionRagEnabled: false, jevContextEnabled: false } as any });
    const review = toggle.calls.find((x: any) => x.name === 'jevCompactionEnabled')!;
    expect(review.enabled).toBe(false);
    expect(review.title).toBeUndefined();
    expect(html).toContain('name="jevCompactionPresent" value="1"');
    expect(html).toContain('Automatically sends bounded source excerpts');
    expect(html).toContain('external configured Jev provider');
    expect(html).toContain('not a guarantee of complete preservation');
    expect(html).toContain('unavailable checks do not block compaction');
    expect(html).toContain('Opaque native checkpoints are skipped');
    expect(html).toContain('Independent of context filtering and Function RAG');
});

test('enabling compaction review leaves other switches off', async () => {
    const toggle = spy('ui.toggle', (_c: any, _s: any, o: any) => `<input name="${o.name}">`);
    const ctx = await renderCtx(toggle.override);
    render(ctx, null, { section: 'settings', agent: { id: 'test', jevCompactionEnabled: true } as any });
    expect(toggle.calls.find((x: any) => x.name === 'jevCompactionEnabled')?.enabled).toBe(true);
    expect(toggle.calls.filter((x: any) => x.name !== 'jevCompactionEnabled').every((x: any) => x.enabled === false)).toBe(true);
});
