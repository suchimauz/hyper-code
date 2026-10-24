import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import section from './agentMetaSection';
import inspector from './inspectorSection';
import button from '../procs/ui/button';

const ctx: any = { fns: { procs: { ui: { escape: ({text}: any) => String(text).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'), attr: () => '', button: (o: any) => button(ctx,null,o) } }, ui: { inspectorSection: (o: any) => inspector(ctx,null,o) } } };
const render = (value: number | null = null, global = 65) => section(ctx, null, { agent: { id: 'ab', autoCompactWindowPercent: value } as any, section: 'compaction', globalCompactionPercent: global });
const script = await Bun.file(new URL('./$script_meta.js', import.meta.url)).text();
function fixture(value: number | null = null) {
    const w = new Window();
    w.document.body.innerHTML = `<div class="agent-meta-panel"><div id="agent-meta-compaction-ab" data-meta-section="compaction">${render(value)}</div></div>`;
    let redraws = 0;
    (w as any).htmx = { ajax: () => { redraws++; return Promise.resolve(); } };
    (w as any).hyperLive = { subscribe: (o: any) => { (w as any).live = o; } };
    w.eval(script);
    const slot = w.document.querySelector('[data-meta-section]')!;
    const form: any = slot.querySelector('[data-compaction-saved]');
    const input: any = form.querySelector('input');
    const apply: any = form.querySelector('button');
    const type = (text: string) => { input.value = text; input.dispatchEvent(new w.Event('input', { bubbles: true })); };
    const event = (name: string, target = form, detail: any = {}) => { const e = new w.CustomEvent(name, { bubbles: true, cancelable: true, detail: { ctx: { sourceElement: target, response: { status: detail.successful ? 204 : 500 }, text: detail.xhr?.responseText } } }); target.dispatchEvent(e); return e; };
    return { w, slot, form, input, apply, type, event, redraws: () => redraws };
}
test('compaction renders collapsed semantic section and shared small actions; Reset only for different saved value', () => {
    expect(render()).toContain('<details');
    expect(render()).not.toContain('<details open');
    expect(render()).toContain('data-compaction-apply hidden');
    expect(render()).toContain('ui-button--xs');
    expect(render()).not.toContain('data-compaction-reset');
    expect(render(65)).not.toContain('data-compaction-reset');
    expect(render(70)).toContain('data-compaction-reset="65"');
    expect(render(65)).toContain('Agent override: 65%');
    expect(render(70)).toContain('name="action" value="inherit"');
});
test('numeric equivalence, validation and unchanged Enter guard', () => {
    const f = fixture();
    expect(f.apply.disabled).toBe(true);
    expect(f.event('htmx:before:request').defaultPrevented).toBe(true);
    f.type('65.0'); expect(f.apply.parentElement.hidden).toBe(true);
    for (const v of ['', '14.9', '96']) { f.type(v); expect(f.apply.disabled).toBe(true); }
    for (const v of ['15', '15.5', '29', '30', '95', '70.5']) { f.type(v); expect(f.apply.disabled).toBe(false); }
    f.w.happyDOM.abort();
});
test('busy requests defer live morph; successful Apply updates baseline without erasing newer edits', async () => {
    const f = fixture(); f.type('70');
    f.event('htmx:before:request'); expect(f.apply.disabled).toBe(true);
    (f.w as any).live.resync(); expect(f.redraws()).toBe(0);
    f.type('75');
    f.event('htmx:after:request', f.form, { successful: true });
    expect(f.form.dataset.compactionSaved).toBe('70');
    expect(f.input.value).toBe('75'); expect(f.apply.disabled).toBe(false);
    expect(f.redraws()).toBe(1);
    await f.w.happyDOM.abort();
});
test('failure and network errors remain visible with retry enabled', () => {
    const f = fixture(); f.type('70'); f.event('htmx:before:request');
    f.event('htmx:after:request', f.form, { successful: false, xhr: { responseText: 'Invalid threshold' } });
    const error: any = f.slot.querySelector('[role="alert"]');
    expect(error.hidden).toBe(false); expect(error.textContent).toBe('Invalid threshold');
    expect(f.form.dataset.compactionSaved).toBe('65'); expect(f.apply.disabled).toBe(false);
    f.event('htmx:before:request'); f.event('htmx:after:request', f.form, { successful: false });
    expect(error.textContent).toContain('Please try again');
    f.w.happyDOM.abort();
});
test('Reset inherits and keeps text entered during request', () => {
    const f = fixture(70); const reset: any = f.slot.querySelector('[data-compaction-reset]');
    f.event('htmx:before:request', reset); f.type('80');
    f.event('htmx:after:request', reset, { successful: true });
    expect(f.form.dataset.compactionSaved).toBe('65'); expect(f.input.value).toBe('80');
    f.w.happyDOM.abort();
});
test('old in-flight RPC cannot morph during or after a successful write', () => {
    const f = fixture();
    const rpc = { sourceElement: f.slot, target: f.slot };
    const send = (name: string) => { const e = new f.w.CustomEvent(name, { bubbles: true, cancelable: true, detail: { ctx: rpc } }); f.slot.dispatchEvent(e); return e; };
    send('htmx:before:request');
    f.type('70'); f.event('htmx:before:request');
    expect(send('htmx:before:swap').defaultPrevented).toBe(true);
    f.event('htmx:after:request', f.form, { successful: true });
    expect(send('htmx:before:swap').defaultPrevented).toBe(true);
    expect(f.input.value).toBe('70');
    f.w.happyDOM.abort();
});
test('network exception releases busy state and reports error', () => {
    const f = fixture(); f.type('70'); f.event('htmx:before:request');
    f.event('htmx:error');
    expect(f.apply.disabled).toBe(false);
    expect((f.slot.querySelector('[role="alert"]') as any).hidden).toBe(false);
    f.w.happyDOM.abort();
});
test('live fragment morph preserves dirty numeric text and native disclosure state', () => {
    const f = fixture(); f.type('77');
    const details: any = f.slot.querySelector('details'); details.open = true;
    const rpc = { sourceElement: f.slot, target: f.slot };
    const send = (name: string) => f.slot.dispatchEvent(new f.w.CustomEvent(name, { bubbles: true, detail: { ctx: rpc } }));
    send('htmx:before:request'); send('htmx:before:swap');
    // Simulate a morph touching the input property while keeping the details node.
    f.input.value = '65'; send('htmx:after:swap');
    expect(f.input.value).toBe('77'); expect(details.open).toBe(true);
    expect(f.apply.disabled).toBe(false);
    f.w.happyDOM.abort();
});
