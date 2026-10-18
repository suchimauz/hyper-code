import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import composer from '../ui/chatComposer';
import statusBar from './renderStatusBar';

const source = await Bun.file(new URL('./$script_chat.js', import.meta.url)).text();
const renderer = { fns: { procs: { ui: { attr: () => '' } } } } as unknown as Context;
async function controls(state: string, scheduled = false) {
    const ctx = { fns: {
        procs: { db: { select: async ({ sql }: { sql: string }) => sql.includes('FROM agents') ? [{ run_state: state, next_run_at: scheduled ? 100 : null }] : [] }, ui: {
            escape: ({ text }: { text: unknown }) => Bun.escapeHTML(String(text)),
            button: ({ post }: { post: string }) => `<button type="button" hx-post="${post}" aria-label="Stop generation">Stop</button>`,
        } },
    } } as unknown as Context;
    return statusBar(ctx, null, { agentId: 'ab', part: 'stop' });
}
async function fixture(touch: boolean, width = touch ? 390 : 1280, state = 'running', scheduled = false) {
    const w = new Window({ url: 'https://hyper.test/agent/ab', width, height: 844 });
    Object.defineProperty(w.navigator, 'maxTouchPoints', { value: touch ? 5 : 0 });
    w.requestAnimationFrame = () => 0;
    w.document.body.innerHTML = `<main id="main"><section id="chat-panel"><div id="messages"></div>${await composer(renderer, null, { action: '/agent/ab', controlsHtml: await controls(state, scheduled) })}</section></main>`;
    const input = w.document.getElementById('input')! as any;
    const form = w.document.getElementById('form')! as any;
    let requests = 0, submits = 0;
    form.requestSubmit = () => { requests++; };
    form.addEventListener('submit', (event: Event) => { event.preventDefault(); submits++; });
    w.eval(source); input.value = 'Draft';
    const enter = (opts = {}) => { const e = new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...opts }); input.dispatchEvent(e); return e; };
    return { w, input, form, enter, get requests() { return requests; }, get submits() { return submits; } };
}

test('phone and landscape Return are native newline, including modifiers and composition; never submit', async () => {
    for (const width of [390, 844]) {
        const f = await fixture(true, width);
        try {
            for (const opts of [{}, { shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { isComposing: true }]) expect(f.enter(opts).defaultPrevented).toBe(false);
            expect(f.requests).toBe(0); expect(f.submits).toBe(0);
            expect(f.input.getAttribute('enterkeyhint')).toBe('enter');
            expect(f.input.title).toContain('новая строка');
            expect(f.input.value).toBe('Draft');
        } finally { await f.w.happyDOM.close(); }
    }
});

test('desktop Enter still sends and Shift+Enter remains newline', async () => {
    const f = await fixture(false);
    try {
        expect(f.enter().defaultPrevented).toBe(true); expect(f.requests).toBe(1);
        expect(f.enter({ shiftKey: true }).defaultPrevented).toBe(false); expect(f.requests).toBe(1);
    } finally { await f.w.happyDOM.close(); }
});

test('busy and queued agents retain stop alongside one send; idle agents expose only send', async () => {
    for (const [state, scheduled] of [['running', false], ['idle', true], ['idle', false]] as const) {
        const w = new Window();
        try {
            w.document.body.innerHTML = `<form>${await controls(state, scheduled)}</form>`;
            const send = w.document.querySelector('[data-composer-send]');
            const stop = w.document.querySelector('[aria-label="Stop generation"]');
            if (state === 'running' || scheduled) {
                expect(stop?.getAttribute('type')).toBe('button');
                expect(stop?.getAttribute('hx-post')).toBe('/agent/ab/stop');
                expect(stop?.closest('[data-composer-running-controls]')).not.toBeNull();
            } else {
                expect(stop).toBeNull();
            }
            expect(send?.getAttribute('type')).toBe('submit');
            expect(w.document.querySelectorAll('[data-composer-send]').length).toBe(1);
        } finally { await w.happyDOM.close(); }
    }
});

test('send visibility tracks trimmed draft, files and dictation input without being lost on status swaps', async () => {
    const f = await fixture(true);
    try {
        const set = (text: string) => { f.input.value = text; f.input.dispatchEvent(new f.w.Event('input', { bubbles: true })); };
        expect(f.form.hasAttribute('data-composer-send-ready')).toBe(true);
        set('  \n '); expect(f.form.hasAttribute('data-composer-has-content')).toBe(false);
        set('Recognized or typed text'); expect(f.form.hasAttribute('data-composer-has-content')).toBe(true);
        const region = f.form.querySelector('[data-composer-submit]')!;
        region.innerHTML = await controls('idle');
        expect(f.form.hasAttribute('data-composer-has-content')).toBe(true);
        expect(region.querySelector('[data-composer-send]')).not.toBeNull();
        set(''); expect(f.form.hasAttribute('data-composer-has-content')).toBe(false);
        const files = f.form.querySelector('#files')!;
        Object.defineProperty(files, 'files', { value: [new f.w.File(['hello'], 'draft.txt', { type: 'text/plain' })], configurable: true });
        files.dispatchEvent(new f.w.Event('change'));
        expect(f.form.hasAttribute('data-composer-has-content')).toBe(true);
        Object.defineProperty(files, 'files', { value: [], configurable: true });
        files.dispatchEvent(new f.w.Event('change'));
        expect(f.form.hasAttribute('data-composer-has-content')).toBe(false);
    } finally { await f.w.happyDOM.close(); }
});


test('nonempty text or attachments submit while running or queued, with duplicate-request protection', async () => {
    for (const [touch, width] of [[true, 390], [true, 844], [false, 1280]] as const) {
        for (const [state, scheduled] of [['running', false], ['idle', true]] as const) {
            const f = await fixture(touch, width, state, scheduled);
            try {
                const submit = () => f.form.dispatchEvent(new f.w.Event('submit', { bubbles: true, cancelable: true }));
                const setText = (value: string) => { f.input.value = value; f.input.dispatchEvent(new f.w.Event('input', { bubbles: true })); };
                setText('  \n '); submit(); expect(f.submits).toBe(0);
                setText('Уточнение для работающего агента');
                expect(f.form.querySelector('[data-composer-send]')).not.toBeNull();
                submit(); expect(f.submits).toBe(1);
                expect(f.form.hasAttribute('data-chat-submitting')).toBe(true);
                expect(f.form.elements.requestId.value).not.toBe('');
                submit(); expect(f.submits).toBe(1);
                f.form.dispatchEvent(new f.w.CustomEvent('htmx:after:request', { bubbles: true, detail: { ctx: { sourceElement: f.form, response: { status: 204 } } } }));
                expect(f.input.value).toBe('');
                expect(f.form.hasAttribute('data-composer-has-content')).toBe(false);
                expect(f.form.querySelector('[aria-label="Stop generation"]')?.getAttribute('hx-post')).toBe('/agent/ab/stop');
                const files = f.form.querySelector('#files')!;
                Object.defineProperty(files, 'files', { value: [new f.w.File(['note'], 'note.txt', { type: 'text/plain' })], configurable: true });
                files.dispatchEvent(new f.w.Event('change'));
                expect(f.form.hasAttribute('data-composer-has-content')).toBe(true);
                submit(); expect(f.submits).toBe(2);
            } finally { await f.w.happyDOM.close(); }
        }
    }
});

test('a live status swap to running does not block a draft written while idle', async () => {
    const f = await fixture(true, 390, 'idle');
    try {
        f.input.dispatchEvent(new f.w.Event('input', { bubbles: true }));
        f.form.querySelector('[data-composer-submit]')!.innerHTML = await controls('running');
        expect(f.form.hasAttribute('data-composer-has-content')).toBe(true);
        expect(f.form.querySelectorAll('[data-composer-send]').length).toBe(1);
        f.form.dispatchEvent(new f.w.Event('submit', { bubbles: true, cancelable: true }));
        expect(f.submits).toBe(1);
    } finally { await f.w.happyDOM.close(); }
});
