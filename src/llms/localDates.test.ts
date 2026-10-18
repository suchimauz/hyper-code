import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import card from './accountsCard';

const script = await Bun.file(new URL('./$script_localDates.js', import.meta.url)).text();

test('quota dates use Russian formatting in the browser timezone and update after live morphs', () => {
  let changed: () => void = () => {};
  let instant = '2026-10-18T23:30:00.000Z';
  const node = { textContent: '', getAttribute: () => instant };
  const window: Record<string, () => void> = {};
  const context = {
    window, Date,
    Intl: { DateTimeFormat: class extends Intl.DateTimeFormat {
      constructor(locale: string, opts: Intl.DateTimeFormatOptions) { super(locale, { ...opts, timeZone: 'Europe/Moscow' }); }
    } },
    document: { documentElement: {}, querySelectorAll: () => [node] },
    MutationObserver: class { constructor(fn: () => void) { changed = fn; } observe() {} },
    queueMicrotask: (fn: () => void) => fn(),
  };
  runInNewContext(script, context);
  expect(node.textContent).toBe('19.10.2026, 02:30');
  instant = '2026-10-19T10:05:00.000Z'; changed();
  expect(node.textContent).toBe('19.10.2026, 13:05');
  node.textContent = 'replaced'; runInNewContext(script, context);
  expect(node.textContent).toBe('19.10.2026, 13:05');
  instant = 'invalid'; changed();
  expect(node.textContent).toBe('19.10.2026, 13:05');
});

test('node quota renders semantic timestamps for reset, measurement and rolling windows', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  const ctx: any = { fns: { procs: { ui: {
    escape: ({text}: any) => String(text).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    heading: () => '', button: () => '', row: () => '', empty: () => '',
  } }, ui: { live: ({html}: any) => html, popup: () => '' } } };
  const node: any = { name: 'mini', enabled: true, catalogAt: now,
    catalog: [{ id: 'codex:sample', provider: 'codex', account: 'alice' }],
    usage: [{ provider: 'codex', account: 'alice', usedPercent: 43, updatedAt: now,
      resetsAt: now + 3600000, windows: { primary: { usedPercent: 43, resetsAt: now + 3600000 } } }],
  };
  const render = () => card(ctx, null, { accounts: [], nodes: [node], models: { 'hyper/mini': ['hyper/mini:codex:sample'] }, now });
  const html = render();
  expect(html.match(/data-llm-local-time/g)).toHaveLength(3);
  expect(html).toContain('Сброс лимита: <time');
  expect(html).toContain('Замер: <time');
  expect(html).toContain('18.10.2026, 13:00');
  expect(html).toContain('/llms/localDates.js');
  node.usage[0].resetsAt = Infinity;
  node.usage[0].updatedAt = Infinity;
  node.usage[0].windows.primary.resetsAt = 9e15;
  expect(render()).toContain('Время сброса неизвестно');
  expect(render()).toContain('Время замера неизвестно');
});
