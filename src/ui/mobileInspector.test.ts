import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import renderPanel from './agentMetaPanel';
import header from '../chat/header';

const source = await Bun.file(new URL('./$script_mobileInspector.js', import.meta.url)).text();
const chatSource = await Bun.file(new URL('../agent/$script_chat.js', import.meta.url)).text();
const metaSource = await Bun.file(new URL('./$script_meta.js', import.meta.url)).text();
const context = { fns: {
    procs: { ui: { escape: ({ text }: any) => Bun.escapeHTML(String(text)), button: () => '<button data-agent-meta-toggle></button>' } },
    ui: { agentMetaSection: ({ section }: any) => `<details open><summary>${section}</summary><textarea data-section-edit>${section}</textarea></details>`, popup: () => '', modelLogo: () => '', inplacePopup: async () => '<button data-test-more>More</button>' },
    chat: { icon: () => '', renderParts: async () => [] },
} } as unknown as Context;
async function fixture(width = 390) {
    const w = new Window({ url: 'https://local/agent/a', width, height: 844 });
    w.requestAnimationFrame = () => 0;
    Object.defineProperty(w.navigator, 'maxTouchPoints', { value: width < 1024 ? 5 : 0 });
    const agent = { id: 'a', title: '<My chat>', model: 'test:echo' } as any;
    const top = await header(context, null, { context: { agent } as any });
    const panel = renderPanel(context, null, { agent, collapsed: true });
    w.document.body.innerHTML = `<main id="main"><div data-page="agent"><section id="chat-panel" data-agent-id="a">${top}<div id="messages"><div id="m-1"><div class="assistant">History</div></div></div><form id="form" hx-post="/agent/a"><textarea id="input">My unsent draft</textarea></form></section>${panel}</div></main>`;
    w.eval(chatSource);
    w.fetch = (async () => new w.Response('{}')) as any;
    (w as any).hyperLive = { subscribe: () => {} };
    w.eval(metaSource);
    w.eval(source);
    const doc = w.document;
    const click = (selector: string) => (doc.querySelector(selector) as any).click();
    const event = (name: string, target: Element) => doc.dispatchEvent(new w.CustomEvent(name, { detail: { ctx: { target } } }));
    return { w, doc, click, event };
}

test('inspector moves existing seven live sections into modal and restores exact chat, draft and scroll', async () => {
    const f = await fixture();
    try {
        const panel = f.doc.querySelector('[data-agent-meta-panel]')!;
        const messages = f.doc.getElementById('messages')!;
        const form = f.doc.getElementById('form')!;
        const input = f.doc.getElementById('input') as any;
        messages.scrollTop = 123;
        input.setSelectionRange(3, 8);
        input.focus();
        f.click('[data-mobile-inspector-open]');
        const dialog = f.doc.querySelector('dialog')!;
        expect(dialog.open).toBe(true);
        expect(dialog.getAttribute('aria-labelledby')).toBe('mobile-inspector-title-a');
        expect(dialog.querySelector('[data-agent-meta-panel]')).toBe(panel);
        expect(dialog.querySelectorAll('[data-meta-section]').length).toBe(7);
        expect(f.doc.querySelectorAll('#agent-meta-settings-a').length).toBe(1);
        expect(f.doc.activeElement).toBe(dialog.querySelector('[data-mobile-inspector-close]'));
        const edit = dialog.querySelector('[data-section-edit]') as any;
        edit.value = 'Local inspector draft';
        (dialog.querySelector('[data-agent-meta-content]') as any).scrollTop = 75;
        messages.scrollTop = 999;
        f.event('htmx:after:swap', edit.parentElement);
        f.click('[data-mobile-inspector-close]');
        expect(f.doc.querySelector('dialog')).toBeNull();
        expect(f.doc.getElementById('form')).toBe(form);
        expect(input.value).toBe('My unsent draft');
        expect(input.selectionStart).toBe(3); expect(input.selectionEnd).toBe(8);
        expect(messages.scrollTop).toBe(123);
        expect(panel.parentElement?.getAttribute('data-page')).toBe('agent');
        expect(panel.classList.contains('agent-meta-collapsed')).toBe(true);
        expect(edit.value).toBe('Local inspector draft');
        expect((panel.querySelector('[data-agent-meta-content]') as any).scrollTop).toBe(75);
        expect(f.doc.activeElement).toBe(f.doc.querySelector('[data-mobile-inspector-open]'));
        f.click('[data-mobile-inspector-open]');
        expect(f.doc.querySelectorAll('[data-agent-meta-panel]').length).toBe(1);
    } finally { await f.w.happyDOM.close(); }
});

test('Escape/native close and desktop breakpoint restore the shell without saving collapsed preference', async () => {
    const f = await fixture();
    try {
        let fetches = 0; f.w.fetch = (async () => { fetches++; }) as any;
        f.click('[data-mobile-inspector-open]');
        f.doc.querySelector('dialog')!.dispatchEvent(new f.w.Event('cancel', { cancelable: true }));
        expect(f.doc.querySelector('dialog')).toBeNull();
        f.click('[data-mobile-inspector-open]');
        f.doc.querySelector('dialog')!.close();
        expect(f.doc.querySelector('dialog')).toBeNull();
        f.click('[data-mobile-inspector-open]');
        f.w.happyDOM.setWindowSize({ width: 1280, height: 900 });
        f.doc.dispatchEvent(new f.w.Event('htmx:after:process'));
        expect(f.doc.querySelector('dialog')).toBeNull();
        expect(fetches).toBe(0);
    } finally { await f.w.happyDOM.close(); }
});

test('navigation tears down modal before page swap; section updates keep it open and single-mounted', async () => {
    const f = await fixture();
    try {
        f.w.eval(source);
        f.click('[data-mobile-inspector-open]');
        f.event('htmx:before:swap', f.doc.getElementById('agent-meta-plan-a')!);
        expect(f.doc.querySelector('dialog')?.open).toBe(true);
        f.event('htmx:before:swap', f.doc.getElementById('main')!);
        expect(f.doc.querySelector('dialog')).toBeNull();
        expect(f.doc.querySelectorAll('[data-agent-meta-panel]').length).toBe(1);
        expect(f.doc.querySelector('[data-mobile-inspector-open]')?.getAttribute('aria-expanded')).toBe('false');
    } finally { await f.w.happyDOM.close(); }
});

test('desktop, sidebar and missing panel do not open mobile inspector', async () => {
    const f = await fixture(1280);
    try {
        f.click('[data-mobile-inspector-open]');
        expect(f.doc.querySelector('dialog')).toBeNull();
        f.w.happyDOM.setWindowSize({ width: 390, height: 844 });
        f.doc.body.dataset.presentation = 'sidebar';
        f.doc.dispatchEvent(new f.w.Event('htmx:after:process'));
        expect(f.doc.querySelector('[data-inspector-ready]')).toBeNull();
        f.click('[data-mobile-inspector-open]');
        expect(f.doc.querySelector('dialog')).toBeNull();
        delete f.doc.body.dataset.presentation;
        f.doc.querySelector('[data-agent-meta-panel]')!.remove();
        f.doc.dispatchEvent(new f.w.Event('htmx:after:process'));
        expect(f.doc.querySelector('[data-inspector-ready]')).toBeNull();
    } finally { await f.w.happyDOM.close(); }
});

test('desktop delegates to persistent Meta toggle and synchronizes external collapse', async () => {
    const f = await fixture(1280);
    try {
        const trigger = f.doc.querySelector('[data-mobile-inspector-open]')!;
        const panel = f.doc.querySelector('[data-agent-meta-panel]')!;
        const requests: string[] = [];
        f.w.fetch = (async (url: any) => { requests.push(String(url)); return new f.w.Response('{}'); }) as any;
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(trigger.getAttribute('aria-haspopup')).toBeNull();
        f.click('[data-mobile-inspector-open]');
        expect(panel.classList.contains('agent-meta-collapsed')).toBe(false);
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        expect(trigger.getAttribute('aria-pressed')).toBe('true');
        expect(trigger.getAttribute('aria-label')).toBe('Свернуть инспектор чата');
        expect(requests).toEqual(['/ui/right-panel']);
        expect(f.doc.querySelector('dialog')).toBeNull();
        f.click('[data-agent-meta-toggle]');
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(trigger.getAttribute('aria-pressed')).toBe('false');
        expect(trigger.getAttribute('title')).toBe('Открыть инспектор чата');
        panel.classList.remove('agent-meta-collapsed');
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
    } finally { await f.w.happyDOM.close(); }
});

for (const width of [390, 1280]) test(`lazy portaled inspector shares the panel at width ${width}`, async () => {
    const f = await fixture(width);
    try {
        const panel = f.doc.querySelector('[data-agent-meta-panel]')!;
        f.doc.body.insertAdjacentHTML('beforeend', '<div data-chat-panel><button id="lazy-inspector" data-mobile-inspector-open aria-controls="agent-meta-a">Inspector</button></div>');
        f.doc.dispatchEvent(new f.w.Event('htmx:after:process'));
        const lazy = f.doc.getElementById('lazy-inspector')!;
        expect(lazy.hasAttribute('data-inspector-ready')).toBe(true);
        f.click('#lazy-inspector');
        for (const trigger of f.doc.querySelectorAll('[data-mobile-inspector-open]')) {
            expect(trigger.getAttribute('aria-expanded')).toBe('true');
            expect(trigger.getAttribute('aria-pressed')).toBe('true');
        }
        expect(f.doc.querySelectorAll('[data-agent-meta-panel]').length).toBe(1);
        if (width === 390) {
            expect(f.doc.querySelector('dialog [data-agent-meta-panel]')).toBe(panel);
            f.click('[data-mobile-inspector-close]');
            expect(f.doc.querySelector('[data-page="agent"] [data-agent-meta-panel]')).toBe(panel);
            expect(f.doc.activeElement).toBe(f.doc.querySelector('[data-mobile-inspector-open]'));
        } else {
            expect(f.doc.querySelector('dialog')).toBeNull();
            f.click('#lazy-inspector');
        }
        for (const trigger of f.doc.querySelectorAll('[data-mobile-inspector-open]')) expect(trigger.getAttribute('aria-expanded')).toBe('false');
    } finally { await f.w.happyDOM.close(); }
});

test('desktop inspector pressed state follows Canvas peek rather than saved rail collapse', async () => {
    const f = await fixture(1280);
    try {
        const page = f.doc.querySelector('[data-page="agent"]')!;
        const panel = f.doc.querySelector('[data-agent-meta-panel]')!;
        const trigger = f.doc.querySelector('[data-mobile-inspector-open]')!;
        panel.classList.remove('agent-meta-collapsed');
        page.setAttribute('data-canvas-open', '');
        f.doc.dispatchEvent(new f.w.Event('htmx:after:process'));
        expect(trigger.getAttribute('aria-pressed')).toBe('false');
        page.setAttribute('data-canvas-meta-open', '');
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(trigger.getAttribute('aria-pressed')).toBe('true');
        page.removeAttribute('data-canvas-meta-open');
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(trigger.getAttribute('aria-pressed')).toBe('false');
        page.removeAttribute('data-canvas-open');
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(trigger.getAttribute('aria-pressed')).toBe('true');
    } finally { await f.w.happyDOM.close(); }
});
