import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import route from '../llms/$route_mobileUsage_GET';
const source = await Bun.file(new URL('./$script_mobileUsage.js', import.meta.url)).text();
const entry = (i: number, patch = {}) => ({ provider: 'codex', account: 'work' + i, label: 'Codex · work' + i, model: 'codex:', models: ['codex:gpt-demo'], usedPercent: 25, resetsAt: Date.now() + 3600000, planType: 'Team', updatedAt: Date.now(), parkedAgents: 0, tone: 'neutral', ...patch });
const strip = '<button type="button" class="mobile-usage-strip" data-mobile-usage-open aria-expanded="false"><span data-mobile-usage-items></span><span data-mobile-usage-count></span></button>';
async function fixture(count = 3, width = 390) {
 const w = new Window({ url: 'https://local/agent/demo', width, height: 844 });
 w.requestAnimationFrame = () => 0; w.setInterval = (() => 0) as any;
 Object.defineProperty(w.navigator, 'maxTouchPoints', { value: width < 1024 ? 5 : 0 });
 w.document.body.innerHTML = `<main id="main">${strip}<div id="messages"></div><form id="form"><textarea id="input">Draft</textarea><input id="files" type="file" multiple></form></main>`;
 let response: any = { entries: Array.from({ length: count }, (_, i) => entry(i)), gateway: null }, fail = false;
 const calls: any[] = []; let subscriber: any;
 (w as any).hyperLive = { subscribe: (opts: any) => { subscriber = opts; } };
 w.fetch = (async (url: any, opts: any) => { calls.push({ url, opts }); if (fail) throw Error('offline'); return { ok: true, json: async () => response }; }) as any;
 const proto = w.HTMLElement.prototype;
 proto.getBoundingClientRect = function () { return { width: this.hasAttribute('data-mobile-usage-items') ? width - 60 : this.hasAttribute('data-usage-chip') ? 32 : 0 } as any; };
 w.eval(source);
 const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
 await tick();
 const click = (sel: string) => (w.document.querySelector(sel) as any).click();
 return { w, d: w.document, calls, tick, click, subscriber, change: (r: any) => { response = r; }, offline: (value: boolean) => { fail = value; } };
}

test('live invalidation during a pending read is coalesced into one follow-up; a late response never reopens modal', async () => {
 const f = await fixture();
 try {
  let release!: (value: any) => void, reads = 0;
  f.w.fetch = (async () => { reads++; if (reads === 1) return new Promise(resolve => { release = resolve; }); return { ok: true, json: async () => ({ entries: [entry(0, { usedPercent: 60 })], gateway: null }) }; }) as any;
  f.click('[data-mobile-usage-open]');
  f.subscriber.resync(); f.subscriber.resync();
  f.click('[data-usage-back]');
  release({ ok: true, json: async () => ({ entries: [entry(0)], gateway: null }) });
  await f.tick(); await f.tick();
  expect(reads).toBe(2); expect(f.d.querySelector('dialog')).toBeNull();
  expect(f.d.querySelector('[data-usage-chip]')!.getAttribute('title')).toContain('остаток 40%');
 } finally { await f.w.happyDOM.close(); }
});

test('old local snapshots are stale even after a successful GET and reconnect requirements are explicit', async () => {
 const f = await fixture();
 try {
  f.change({ entries: [entry(0, { updatedAt: 1, needsReconnect: true })], gateway: null });
  f.click('[data-mobile-usage-open]'); await f.tick();
  expect(f.d.querySelector('[data-usage-chip]')!.getAttribute('data-quota-state')).toBe('stale');
  expect(f.d.querySelector('dialog')!.textContent).toContain('Требуется повторное подключение');
  expect(f.d.querySelector('dialog')!.textContent).toContain('Данные устарели');
 } finally { await f.w.happyDOM.close(); }
});

test('project chrome live replacement keeps modal open and Back focuses the new strip', async () => {
 const f = await fixture();
 try {
  f.click('[data-mobile-usage-open]'); await f.tick();
  const dialog = f.d.querySelector('dialog');
  const old = f.d.querySelector('[data-mobile-usage-open]')!;
  old.outerHTML = strip;
  f.d.dispatchEvent(new f.w.CustomEvent('htmx:after:process'));
  expect(f.d.querySelector('dialog')).toBe(dialog); expect(dialog!.open).toBe(true);
  const replacement = f.d.querySelector('[data-mobile-usage-open]');
  expect(replacement).not.toBe(old); expect(replacement!.getAttribute('aria-expanded')).toBe('true');
  f.click('[data-usage-back]'); expect(f.d.activeElement).toBe(replacement);
 } finally { await f.w.happyDOM.close(); }
});


test('fits whole account chips and +N, supports zero/one/many, does not duplicate installation', async () => {
 for (const count of [0, 1, 3, 12, 120]) {
  const f = await fixture(count);
  try {
   const chips = [...f.d.querySelectorAll('[data-usage-chip]')];
   const visible = chips.filter(c => !c.hasAttribute('hidden')).length;
   expect(chips.length).toBe(count); expect(visible).toBe(Math.min(count, 10));
   expect(f.d.querySelector('[data-mobile-usage-count]')!.textContent).toBe((count > 10 ? '+' + (count - 10) : String(count)) + ' ›');
   f.w.eval(source); expect(f.calls.length).toBe(1);
   expect(f.calls[0].url).toBe('/llms/mobileUsage'); expect(f.calls[0].opts.method).toBeUndefined();
  } finally { await f.w.happyDOM.close(); }
 }
});

test('modal is read-only; Back restores identical draft/files/form and scroll without textarea focus', async () => {
 const f = await fixture(12);
 try {
  const form = f.d.getElementById('form'), files = f.d.getElementById('files') as any, input = f.d.getElementById('input') as any, messages = f.d.getElementById('messages')!;
  const file = new f.w.File(['hello'], 'note.txt'); const transfer = new f.w.DataTransfer(); transfer.items.add(file); files.files = transfer.files;
  messages.scrollTop = 123; input.setSelectionRange(1, 3); input.focus();
  f.click('[data-mobile-usage-open]'); await f.tick();
  expect(f.d.querySelector('dialog')!.open).toBe(true); expect(f.d.querySelectorAll('.mobile-usage-card').length).toBe(12);
  expect(f.d.activeElement).toBe(f.d.querySelector('[data-usage-back]'));
  expect(f.d.querySelector('dialog form, dialog [hx-post], dialog [data-model-route]')).toBeNull();
  messages.scrollTop = 999; f.click('[data-usage-back]');
  expect(f.d.querySelector('dialog')).toBeNull(); expect(f.d.getElementById('form')).toBe(form); expect(files.files[0]).toBe(file);
  expect(input.value).toBe('Draft'); expect(input.selectionStart).toBe(1); expect(input.selectionEnd).toBe(3); expect(messages.scrollTop).toBe(123);
  expect(f.d.activeElement).toBe(f.d.querySelector('[data-mobile-usage-open]'));
 } finally { await f.w.happyDOM.close(); }
});

test('unknown, stale, exhausted, proxy and API availability are distinct; untrusted names stay text', async () => {
 const f = await fixture();
 try {
  f.change({ entries: [entry(0, { usedPercent: null, models: [] }), entry(1, { node: 'team', quotaStatus: 'stale', usedPercent: 80, label: '<img src=x onerror=alert(1)>', models: ['<script>evil</script>'] }), entry(2, { usedPercent: 100 })], gateway: { status: 'available', reason: 'models-ok', models: ['openai/gpt-demo'] } });
  f.click('[data-mobile-usage-open]'); await f.tick();
  const text = f.d.querySelector('dialog')!.textContent;
  expect(text).toContain('Лимит неизвестен'); expect(text).toContain('Последний известный остаток: 20%'); expect(text).toContain('Осталось 0%');
  expect(text).toContain('Через team'); expect(text).toContain('не подтверждает возможность генерации');
  expect(text).toContain('<script>evil</script>'); expect(f.d.querySelector('dialog img, dialog script')).toBeNull();
  expect(f.d.querySelectorAll('progress').length).toBe(2);
  expect(f.d.querySelectorAll('.mobile-usage-card').length).toBe(4);
 } finally { await f.w.happyDOM.close(); }
});

test('refresh preserves expanded models, modal scroll and focus; offline retains explicitly stale values', async () => {
 const f = await fixture();
 try {
  f.click('[data-mobile-usage-open]'); await f.tick();
  const details = f.d.querySelector('details')!; details.open = true; (details.querySelector('summary') as any).focus();
  (f.d.querySelector('.mobile-usage-content') as any).scrollTop = 95;
  f.w.dispatchEvent(new f.w.Event('online')); await f.tick();
  expect(f.d.querySelector('details')!.open).toBe(true); expect(f.d.activeElement?.tagName).toBe('SUMMARY');
  expect(f.d.querySelector('.mobile-usage-content')!.scrollTop).toBe(95);
  f.offline(true); f.click('[data-usage-refresh]'); await f.tick();
  expect(f.d.querySelector('[role="status"]')!.textContent).toContain('Не удалось обновить');
  expect(f.d.querySelector('.mobile-usage-amount')!.textContent).toContain('Последний известный');
  expect(f.d.querySelector('[data-usage-chip]')!.getAttribute('data-quota-state')).toBe('stale');
  f.offline(false); f.click('[data-usage-refresh]'); await f.tick();
  expect(f.d.querySelector('[data-usage-chip]')!.getAttribute('data-quota-state')).toBe('known');
 } finally { await f.w.happyDOM.close(); }
});

test('Escape, navigation and breakpoint close modal; unrelated live swaps do not; desktop does not fetch', async () => {
 const desktop = await fixture(3, 1280);
 try { expect(desktop.calls.length).toBe(0); } finally { await desktop.w.happyDOM.close(); }
 const f = await fixture();
 try {
  f.click('[data-mobile-usage-open]'); f.d.querySelector('dialog')!.dispatchEvent(new f.w.Event('cancel', { cancelable: true })); expect(f.d.querySelector('dialog')).toBeNull();
  f.click('[data-mobile-usage-open]');
  f.d.dispatchEvent(new f.w.CustomEvent('htmx:before:swap', { detail: { ctx: { target: f.d.getElementById('messages') } } }));
  expect(f.d.querySelector('dialog')?.open).toBe(true);
  f.d.dispatchEvent(new f.w.CustomEvent('htmx:before:swap', { detail: { ctx: { target: f.d.getElementById('main') } } })); expect(f.d.querySelector('dialog')?.open).toBe(true);
  f.w.history.pushState({}, '', '/agent/other'); f.d.dispatchEvent(new f.w.Event('htmx:after:process')); expect(f.d.querySelector('dialog')).toBeNull();
  f.click('[data-mobile-usage-open]'); f.w.happyDOM.setWindowSize({ width: 1280, height: 900 }); f.d.dispatchEvent(new f.w.Event('htmx:after:process')); expect(f.d.querySelector('dialog')).toBeNull();
 } finally { await f.w.happyDOM.close(); }
});

test('read-only mobile endpoint uses shared source and returns no-store JSON', async () => {
 let calls = 0;
 const ctx = { fns: { llms: { usageData: async () => { calls++; return { entries: [entry(1)], gateway: { status: 'available', models: ['demo'] } }; } }, ui: { modelLogo: () => '<svg></svg>' } } } as any;
 const response = await route(ctx, null, { req: new Request('https://local/llms/mobileUsage') });
 expect(response.headers.get('cache-control')).toBe('no-store'); expect(calls).toBe(1);
 const json = await response.json(); expect(json.entries[0].logoHtml).toBe('<svg></svg>'); expect(json.entries[0].models).toEqual(['codex:gpt-demo']); expect(json.gateway.status).toBe('available');
});

test('compact strip uses desktop-sized spent rings without visible account labels or percentages', async () => {
 const f = await fixture(1);
 try {
  const host = f.d.querySelector('[data-mobile-usage-open]')!;
  expect(host.querySelector('.mobile-usage-name, .mobile-usage-value')).toBeNull();
  expect(host.textContent).not.toContain('work'); expect(host.textContent).not.toContain('%'); expect(host.textContent).not.toContain('Лимиты');
  expect(host.querySelector('[data-usage-fill]')!.getAttribute('stroke-dasharray')).toBe('18.9 75.4');
  expect(host.querySelector('[data-usage-chip]')!.getAttribute('aria-label')).toContain('остаток 75%');
 } finally { await f.w.happyDOM.close(); }
});

test('temporary detached opener and delayed close event from an older dialog cannot close current overview', async () => {
 const f = await fixture();
 try {
  f.click('[data-mobile-usage-open]'); const first = f.d.querySelector('dialog')!;
  const trigger = f.d.querySelector('[data-mobile-usage-open]')!;
  trigger.remove(); f.d.dispatchEvent(new f.w.Event('htmx:after:process'));
  expect(first.open).toBe(true);
  f.d.getElementById('main')!.insertAdjacentHTML('afterbegin', strip); f.d.dispatchEvent(new f.w.Event('htmx:after:process'));
  f.click('[data-usage-back]'); f.click('[data-mobile-usage-open]'); const second = f.d.querySelector('dialog')!;
  first.dispatchEvent(new f.w.Event('close')); expect(second.open).toBe(true); expect(f.d.querySelector('dialog')).toBe(second);
 } finally { await f.w.happyDOM.close(); }
});

test('real HTMX swap:none and chrome processing keep dialog mounted until navigation or explicit Back', async () => {
 const f = await fixture();
 try {
  // Happy DOM lacks XPath; this fixture has no hx-on attributes to enumerate.
  (f.w as any).XPathEvaluator = class { createExpression() { return { evaluate() { return { iterateNext() { return null; } }; } }; } };
  (f.w as any).XPathResult = { ORDERED_NODE_ITERATOR_TYPE: 5 };
  f.w.eval(await Bun.file(new URL('../../node_modules/htmx.org/dist/htmx.js', import.meta.url)).text());
  const htmx = (f.w as any).htmx;
  f.click('[data-mobile-usage-open]'); await f.tick();
  const dialog = f.d.querySelector('dialog')!;
  for (let i = 0; i < 3; i++) {
   await htmx.swap({ sourceElement: f.d.getElementById('form'), target: f.d.getElementById('main'), swap: 'none', text: '<p>ignored</p>' });
   expect(f.d.querySelector('dialog')).toBe(dialog); expect(dialog.open).toBe(true);
   const old = f.d.querySelector('[data-mobile-usage-open]')!; old.outerHTML = strip; htmx.process(f.d.getElementById('main'));
   expect(f.d.querySelector('dialog')).toBe(dialog); expect(dialog.open).toBe(true);
  }
  f.click('[data-usage-back]'); expect(f.d.querySelector('dialog')).toBeNull();
 } finally { await f.w.happyDOM.close(); }
});


test('mixed provider, proxy, API gateway and parked markers stay one-line with identity only in accessible details', async () => {
 const f = await fixture();
 try {
  const providers = ['codex', 'openai', 'claude-code', 'anthropic-oauth', 'kimi-coding', 'cursor', 'xai', 'lmstudio', 'groq'];
  f.change({ entries: providers.map((provider, i) => entry(i, { provider, node: i % 2 ? 'proxy-node-long-name' : undefined, parkedAgents: i === 8 ? 2 : 0 })), gateway: {status: 'available', reason: 'models-ok', models: []} });
  f.click('[data-mobile-usage-open]'); await f.tick();
  const strip = f.d.querySelector('[data-mobile-usage-open]')!;
  expect(strip.querySelectorAll('[data-usage-chip]').length).toBe(10);
  expect(strip.querySelector('.mobile-usage-node, .mobile-usage-name, .mobile-usage-value')).toBeNull();
  expect(strip.querySelectorAll('.mobile-usage-proxy').length).toBe(4);
  expect(strip.querySelector('.mobile-usage-pause')?.textContent).toBe('Ⅱ');
  expect(strip.querySelector('.mobile-usage-provider-glyph')?.className).toContain('ph-plugs-connected');
  expect(strip.querySelector('.mobile-usage-gateway')?.getAttribute('data-status')).toBe('available');
  expect(f.d.querySelector('.mobile-usage-content')!.textContent).toContain('proxy-node-long-name');
 } finally { await f.w.happyDOM.close(); }
});
