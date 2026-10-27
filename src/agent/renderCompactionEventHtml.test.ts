import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import render from './renderCompactionEventHtml';

const ctx = {} as Context;
test('completed compaction is one quiet line with complete escaped details', async () => {
    const w = new Window();
    const summary = '<img src=x onerror=alert(1)>\n' + 'summary '.repeat(3000);
    w.document.body.innerHTML = await render(ctx, null, { event: { type: 'compaction_completed', tokensBefore: 190000, tokensAfter: 46000, revision: 60, keptMessages: 12, summary } });
    const card = w.document.querySelector('details.context-notice')!;
    expect(card.hasAttribute('open')).toBe(false);
    expect(card.getAttribute('data-compaction-revision')).toBe('60');
    expect(card.getAttribute('data-compaction-state')).toBe('completed');
    expect(card.querySelector('summary')!.textContent).toBe('Контекст сжат190k → 46k');
    expect(card.querySelector('pre')!.textContent).toBe(summary);
    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector('.context-facts')!.textContent).toContain('Сохранено сообщений12');
    expect(card.querySelector('.context-facts')!.textContent).toContain('Версия контекстаv60');
    await w.happyDOM.close();
});
test('running, failed and unknown event variants remain distinguishable', async () => {
    const running = await render(ctx, null, { event: { type: 'compaction_start', revision: 2 } });
    expect(running).toContain('Сжимаю контекст');
    expect(running).toContain('v2');
    const failed = await render(ctx, null, { event: { type: 'compaction_failed', error: '<error>' } });
    expect(failed).toContain('context-notice-failed');
    expect(failed).not.toContain('data-compaction-revision');
    expect(failed).toContain('data-compaction-state="failed"');
    expect(failed).toContain('Не удалось сжать контекст');
    expect(failed).toContain('&lt;error&gt;');
    expect(failed).toContain('Контекст не изменён.');
    expect(await render(ctx, null, { event: { type: 'other' } })).toBe('');
    const malformed = await render(ctx, null, { event: { type: 'compaction_completed', tokensBefore: NaN, tokensAfter: Infinity, revision: -1 } });
    expect(malformed).not.toContain('NaN');
    expect(malformed).not.toContain('Infinity');
});
