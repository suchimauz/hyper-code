import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import composer from '../ui/chatComposer';

const source = await Bun.file(new URL('./$script_chat.js', import.meta.url)).text();
const ctx = { fns: { procs: { ui: { attr: () => 'data-form="chat"' } } } } as unknown as Context;

async function fixture() {
    const window = new Window({ url: 'https://local/agent/ab', width: 390, height: 844 });
    Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 5 });
    window.requestAnimationFrame = () => 0;
    const html = await composer(ctx, null, {
        action: '/agent/ab',
        toolsHtml: '<button type="button" data-chat-part="model">Model</button><button type="button" data-chat-part="effort">Max</button>',
        metersHtml: '<div id="chat-context-ring" hx-get="/chat/ab/ring" hx-swap="innerHTML"><button type="button" id="context" data-context-meter>95%</button></div>',
        statusHtml: '<button type="button" id="prompt">Prompt</button>',
    });
    window.document.body.innerHTML = `<main id="main"><section id="chat-panel"><div id="messages"></div>${html}</section></main>`;
    window.eval(source);
    const form = window.document.getElementById('form')!;
    const settings = window.document.querySelector('[data-composer-settings]')!;
    const toggle = window.document.querySelector('[data-composer-settings-toggle]')! as any;
    const input = window.document.getElementById('input')! as any;
    return { window, html, form, settings, toggle, input };
}

test('settings are collapsed by default, toggle without submitting, and reuse real controls', async () => {
    const f = await fixture();
    try {
        let submits = 0;
        f.form.addEventListener('submit', () => submits++);
        const model = f.settings.querySelector('[data-chat-part="model"]');
        expect(f.form.hasAttribute('data-composer-settings-ready')).toBe(true);
        expect(f.toggle.getAttribute('aria-controls')).toBe(f.settings.id);
        expect(f.toggle.getAttribute('aria-expanded')).toBe('false');
        expect(f.settings.hasAttribute('data-open')).toBe(false);
        f.toggle.click();
        expect(f.settings.hasAttribute('data-open')).toBe(true);
        expect(f.toggle.getAttribute('aria-expanded')).toBe('true');
        expect(f.settings.querySelector('[data-chat-part="model"]')).toBe(model);
        for (const selector of ['[data-chat-part="effort"]', '#prompt']) expect(f.settings.querySelector(selector)).not.toBeNull();
        const ring = f.form.querySelector('#chat-context-ring')!;
        expect(ring.getAttribute('hx-get')).toBe('/chat/ab/ring');
        expect(f.settings.contains(ring)).toBe(false);
        expect(f.form.querySelectorAll('#chat-context-ring').length).toBe(1);
        ring.innerHTML = '<button type="button" data-context-meter>103%</button>';
        expect(f.form.querySelector('[data-chat-meters]')!.textContent).toBe('103%');
        f.toggle.click();
        expect(f.settings.hasAttribute('data-open')).toBe(false);
        expect(submits).toBe(0);
        for (const selector of ['[data-attach-button]', '[data-dictate]', '[data-composer-submit]', '[data-chat-meters]']) expect(f.settings.contains(f.form.querySelector(selector))).toBe(false);
    } finally { await f.window.happyDOM.close(); }
});

test('typing collapses mobile settings without changing a draft or selection', async () => {
    const f = await fixture();
    try {
        f.input.value = 'Keep this draft';
        f.input.setSelectionRange(2, 5);
        f.toggle.click();
        f.input.focus();
        expect(f.settings.hasAttribute('data-open')).toBe(false);
        expect(f.toggle.getAttribute('aria-expanded')).toBe('false');
        expect(f.input.value).toBe('Keep this draft');
        expect(f.input.selectionStart).toBe(2);
        expect(f.input.selectionEnd).toBe(5);
    } finally { await f.window.happyDOM.close(); }
});

test('old controller cannot toggle detached settings; drafts without tools have no dead button', async () => {
    const f = await fixture();
    try {
        f.window.document.getElementById('main')!.dispatchEvent(new f.window.Event('htmx:before:cleanup', { bubbles: true }));
        f.toggle.click();
        expect(f.settings.hasAttribute('data-open')).toBe(false);
        const html = await composer(ctx, null, { action: '/agent/new' });
        expect(html).not.toContain('data-composer-settings-toggle');
        expect(html).not.toContain('data-composer-settings-ready');
        expect(f.html).not.toContain('data-composer-settings-ready');
        const meterOnly = await composer(ctx, null, { action: '/agent/new', metersHtml: '<button>50%</button>' });
        expect(meterOnly).not.toContain('data-composer-settings-toggle');
    } finally { await f.window.happyDOM.close(); }
});
