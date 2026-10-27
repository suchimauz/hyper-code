import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { renderCtx } from './testRender.entry';

const ctx = await renderCtx({ 'ui.faviconUrl': () => '/favicon.ico', 'ui.navMenu': () => '', 'dock.render': () => '' });
const agent: any = { id: 'rail', scratchpad: { goalTrackingEnabled: true, goalSidecar: { status: 'ready', goals: [{ id: 'goal', status: 'active', statement: 'A long observed goal', verification: 'Verify the output' }] } } };
const script = await Bun.file(new URL('./$script_meta.js', import.meta.url)).text();
const html = await ctx.fns.ui.layout({ main: ctx.fns.ui.agentMetaPanel({ agent }) });
function fixture(theme = 'light') {
    const w = new Window();
    w.document.write(html.replace('<html>', `<html data-theme="${theme}">`));
    const tokens = w.document.createElement('style');
    tokens.textContent = ':root { --theme-base-100: #fff; --theme-base-200: #f3f4f5; --theme-base-300: #e5e7eb; --color-canvas: #fafafb; --theme-focus: #0066cc; --ui-border: #dce1e6; }';
    w.document.head.append(tokens);
    return w;
}

test('desktop inspector is an opaque square rail, without floating card margins or glass', () => {
    const w = fixture();
    const panel = w.document.querySelector('[data-agent-meta-panel]')!;
    expect(panel.classList.contains('glass-panel')).toBe(false);
    expect(panel.classList.contains('rounded-2xl')).toBe(false);
    expect(panel.querySelector('[data-desktop-inspector-header]')!.classList.contains('glass-bar')).toBe(false);
    const style = w.getComputedStyle(panel);
    expect(style.marginTop).toBe('0px'); expect(style.marginRight).toBe('0px');
    expect(style.height).toBe('100%'); expect(style.borderRadius).toBe('0px');
    expect(style.boxShadow).toBe('none');
    w.happyDOM.abort();
});

test('inspector does not reserve an empty right scrollbar gutter', () => {
    const w = fixture();
    const content = w.document.querySelector('[data-agent-meta-content]')!;
    expect(w.getComputedStyle(content).getPropertyValue('scrollbar-gutter')).toBe('auto');
    expect(content.classList.contains('overflow-y-auto')).toBe(true);
    w.happyDOM.abort();
});

test('rail surfaces reuse the project canvas white and preserve dark theme depth', () => {
    const w = fixture();
    for (const selector of ['[data-agent-meta-panel]', '[data-desktop-inspector-header]', '[data-agent-meta-content]', '.inspector-section-body', '[data-agent-inspector-tab][aria-selected="true"]']) {
        expect(w.getComputedStyle(w.document.querySelector(selector)!).backgroundColor).toBe('#fafafb');
    }
    expect(w.getComputedStyle(w.document.querySelector('.inspector-detail-body')!).backgroundColor).toBe('#f3f4f5');
    const dark = fixture('dark'); // happy-dom caches ancestor custom properties after theme mutations.
    expect(dark.getComputedStyle(dark.document.querySelector('[data-agent-meta-panel]')!).backgroundColor).toBe('#fff');
    dark.happyDOM.abort();
    w.happyDOM.abort();
});

test('disclosure feedback is scoped to click targets with pointer, keyboard and pressed states', () => {
    const w = fixture();
    const css = [...w.document.querySelectorAll('style')].map(s => s.textContent).join('\n');
    expect(css).toContain('@media (hover: hover) and (pointer: fine)');
    expect(css).toContain(':hover { background: var(--inspector-hover-bg); }');
    expect(css).toContain(':active { background: var(--inspector-pressed-bg); transition: none; }');
    expect(css).toContain('label:has(> input[type="checkbox"]:focus-visible)');
    expect(css).not.toContain('.inspector-row:hover'); // Content is not a pretend button.
    expect(css).toContain('summary:not(.ui-button)'); // Shared button states remain owned by the kit.
    const summary = w.document.querySelector('[data-inspector-disclosure="goal-goal"] > summary')!;
    expect(w.getComputedStyle(summary).cursor).toBe('pointer');
    expect(w.getComputedStyle(summary).transition).toBe('background-color .12s ease');
    const outside = w.document.createElement('details'); outside.innerHTML = '<summary>Unrelated surface</summary>';
    w.document.body.append(outside);
    expect(w.getComputedStyle(outside.querySelector('summary')!).transition).not.toBe('background-color .12s ease');
    w.happyDOM.abort();
});

test('expanded goal details and section bodies have explicit nonzero inner spacing', () => {
    const w = fixture();
    const detail = w.document.querySelector('[data-inspector-disclosure="goal-goal"] > .inspector-detail-body')!;
    expect(detail).not.toBeNull();
    const style = w.getComputedStyle(detail);
    expect(style.paddingLeft).toBe('12px'); expect(style.paddingRight).toBe('12px');
    expect(style.paddingTop).toBe('10px'); expect(style.borderLeftWidth).toBe('2px');
    expect(detail.textContent).toContain('Verify the output');
    expect(w.getComputedStyle(w.document.querySelector('.inspector-section-body')!).paddingLeft).toBe('12px');
    w.happyDOM.abort();
});

test('each semantic badge palette has WCAG AA text contrast in both themes', () => {
    const luminance = (hex: string) => {
        const v = hex.match(/\w\w/g)!.map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
        return v[0]! * .2126 + v[1]! * .7152 + v[2]! * .0722;
    };
    for (const tone of ['active', 'success', 'waiting', 'danger', 'neutral']) {
        const texts = [...html.matchAll(new RegExp(`--inspector-${tone}-text: #([0-9a-f]{6})`, 'g'))];
        const backgrounds = [...html.matchAll(new RegExp(`--inspector-${tone}-bg: #([0-9a-f]{6})`, 'g'))];
        expect(texts.length).toBe(2); expect(backgrounds.length).toBe(2);
        texts.forEach((text, i) => {
            const a = luminance(text[1]!); const b = luminance(backgrounds[i]![1]!);
            expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(4.5);
        });
    }
});

test('switch badges reflect checked and unavailable states without changing controls or drafts', () => {
    const w = fixture();
    let subscription: any;
    (w as any).hyperLive = { subscribe: (value: any) => { subscription = value; } };
    (w as any).htmx = { ajax: () => Promise.resolve() };
    w.eval(script);
    const row: any = w.document.querySelector('[name="goalTrackingEnabled"]')?.closest('label') ?? w.document.querySelector('#agent-meta-goal-rail label');
    const input: any = row.querySelector('input[type=checkbox]');
    const badge = row.querySelector('.inspector-toggle-state');
    expect(badge.textContent).toBe('Вкл.'); expect(badge.dataset.tone).toBe('success');
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    expect(input.nextElementSibling.classList.contains('ui-toggle-track')).toBe(true);
    input.checked = false; input.dispatchEvent(new w.Event('change', { bubbles: true }));
    expect(badge.textContent).toBe('Выкл.'); expect(badge.dataset.tone).toBe('neutral');
    input.disabled = true;
    row.dispatchEvent(new w.Event('htmx:after:process', { bubbles: true }));
    expect(badge.textContent).toBe('Недоступно');
    const gate: any = w.document.querySelector('[name="functionRagGateEnabled"]');
    expect(gate.disabled).toBe(false); // The existing form contract stays intact.
    expect(gate.closest('label').querySelector('.inspector-toggle-state').textContent).toBe('Недоступно');
    expect(typeof subscription.resync).toBe('function');
    w.happyDOM.abort();
});

test('collapsed canvas rail hides tabs as well as section content', () => {
    const w = fixture();
    const page = w.document.createElement('div');
    page.setAttribute('data-page', 'agent'); page.setAttribute('data-canvas-open', '');
    page.append(w.document.querySelector('[data-agent-meta-panel]')!); w.document.body.append(page);
    expect(w.getComputedStyle(page.querySelector('[data-agent-inspector-tabs]')!).display).toBe('none');
    page.setAttribute('data-canvas-meta-open', '');
    expect(w.getComputedStyle(page.querySelector('[data-agent-inspector-tabs]')!).display).toBe('flex');
    w.happyDOM.abort();
});
