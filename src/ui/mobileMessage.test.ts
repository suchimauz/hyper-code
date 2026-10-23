import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import renderEvent from '../agent/renderEventHtml';

const source = await Bun.file(new URL('./$script_mobileMessage.js', import.meta.url)).text();
async function setup(width = 390, coarse = false) {
    const window = new Window({ width, height: 844, url: 'http://localhost/agent/test', settings: { navigator: { maxTouchPoints: coarse ? 5 : 0 } } });
    // happy-dom incorrectly applies the final pointer predicate to both comma
    // branches; evaluate each branch with its real media evaluator instead.
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => {
        if (!query.includes(',')) return matchMedia(query);
        const result = matchMedia(query);
        Object.defineProperty(result, 'matches', { get: () => query.split(',').some(branch => matchMedia(branch.trim()).matches) });
        return result;
    };
    window.document.body.innerHTML = `<main id="messages"><div id="m-1"><div class="assistant"><pre><code>${Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n')}</code></pre></div><button data-action="delete-one" hx-confirm="delete this message?" hx-post="/original">Delete message</button><button data-action="delete-from" hx-confirm="delete this and everything after?">Delete from here</button></div></main>`;
    window.eval(await Bun.file(new URL('./$script_codeBlocks.js', import.meta.url)).text());
    Object.defineProperty(window, 'isSecureContext', { value: true });
    window.eval(source);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await new Promise(resolve => setTimeout(resolve, 5));
    return { window, doc: window.document, flush: () => new Promise(resolve => setTimeout(resolve, 5)) };
}

test('mobile actions use original confirmation-bearing controls and return focus', async () => {
    const f = await setup();
    try {
        const trigger = f.doc.querySelector('[data-mobile-message-actions]') as any;
        expect(trigger).not.toBeNull();
        const original = f.doc.querySelector('[data-action="delete-one"]')!;
        let called = 0;
        original.addEventListener('click', () => { called++; expect(original.getAttribute('hx-confirm')).toBe('delete this message?'); });
        trigger.click();
        expect(f.doc.querySelector('dialog')?.hasAttribute('open')).toBe(true);
        expect(f.doc.querySelector('dialog [hx-post]')).toBeNull();
        (f.doc.querySelector('[data-mobile-sheet-action]') as any).click();
        expect(called).toBe(1);
        expect(f.doc.querySelector('dialog')).toBeNull();
        expect(f.doc.activeElement).toBe(trigger);
    } finally { await f.window.happyDOM.close(); }
});

test('code collapse and clipboard feedback do not change source', async () => {
    const f = await setup();
    try {
        const pre = f.doc.querySelector('pre')!;
        const text = pre.textContent;
        expect(pre.closest('[data-chat-code-block]')?.getAttribute('data-code-collapsed')).toBe('true');
        (f.doc.querySelector('[data-code-toggle]') as any).click();
        expect(pre.closest('[data-chat-code-block]')?.getAttribute('data-code-collapsed')).toBe('false');
        let copied = '';
        Object.defineProperty(f.window.navigator, 'clipboard', { value: { writeText: async (s: string) => { copied = s; } } });
        (f.doc.querySelector('[data-code-copy]') as any).click();
        await f.flush();
        expect(copied).toBe(text);
        expect(f.doc.querySelector('[role="status"]')?.textContent).toBe('Скопировано');
        expect(pre.textContent).toBe(text);
        Object.defineProperty(f.window.navigator.clipboard, 'writeText', { value: async () => { throw new Error('denied'); } });
        (f.doc.querySelector('[data-code-copy]') as any).click();
        await f.flush();
        expect(f.doc.querySelector('[role="status"]')?.textContent).toContain('Не удалось');
    } finally { await f.window.happyDOM.close(); }
});

test('HTMX replacement closes sheet; repeated script does not duplicate enhancements', async () => {
    const f = await setup();
    try {
        f.window.eval(source);
        f.doc.dispatchEvent(new f.window.Event('htmx:afterSwap'));
        await f.flush();
        expect(f.doc.querySelectorAll('[data-mobile-message-actions]').length).toBe(1);
        expect(f.doc.querySelectorAll('.chat-code-tools').length).toBe(1);
        (f.doc.querySelector('[data-mobile-message-actions]') as any).click();
        f.doc.querySelector('#messages')!.innerHTML = '';
        await f.flush();
        expect(f.doc.querySelector('dialog')).toBeNull();
    } finally { await f.window.happyDOM.close(); }
});

test('desktop gets code controls without mobile message actions', async () => {
    const f = await setup(1280);
    try {
        expect(f.doc.querySelector('[data-mobile-message-actions]')).toBeNull();
        expect(f.doc.querySelector('.chat-code-tools')).not.toBeNull();
        expect(f.doc.querySelector('pre')?.getAttribute('tabindex')).toBe('0');
    } finally { await f.window.happyDOM.close(); }
});

test('cancel closes sheet and restores trigger focus', async () => {
    const f = await setup();
    try {
        const trigger = f.doc.querySelector('[data-mobile-message-actions]') as any;
        trigger.click();
        f.doc.querySelector('dialog')!.dispatchEvent(new f.window.Event('cancel', { cancelable: true }));
        expect(f.doc.querySelector('dialog')).toBeNull();
        expect(f.doc.activeElement).toBe(trigger);
    } finally { await f.window.happyDOM.close(); }
});


test('shared breakpoint supports touch landscape but not fine-pointer desktop', async () => {
    for (const [width, coarse, expected] of [[700, false, true], [844, true, true], [1023, true, true], [844, false, false], [1024, true, false]] as const) {
        const f = await setup(width, coarse);
        try {
            expect(!!f.doc.querySelector('[data-mobile-message-actions]')).toBe(expected);
        } finally { await f.window.happyDOM.close(); }
    }
});

test('inspector dialog takes priority without mobile sheet stealing focus', async () => {
    const f = await setup();
    try {
        const trigger = f.doc.querySelector('[data-mobile-message-actions]') as any;
        const inspector = f.doc.createElement('dialog');
        const control = f.doc.createElement('button');
        control.textContent = 'Inspector';
        inspector.append(control);
        f.doc.body.append(inspector);
        inspector.showModal();
        control.focus();
        trigger.click();
        expect(f.doc.querySelector('.mobile-message-sheet')).toBeNull();
        inspector.close();
        trigger.click();
        expect(f.doc.querySelector('.mobile-message-sheet')).not.toBeNull();
        inspector.showModal();
        control.focus();
        await f.flush();
        expect(f.doc.querySelector('.mobile-message-sheet')).toBeNull();
        expect(f.doc.activeElement).toBe(control);
    } finally { await f.window.happyDOM.close(); }
});


test('message copy is first, plain text only, excludes controls and reports failure', async () => {
    const f = await setup();
    try {
        f.doc.querySelector('.assistant')!.innerHTML = '<p>Hello <strong>world</strong></p><p>Second</p><span data-no-copy>stamp</span><button>control</button><div class="tool">noise</div><script>bad()</script><style>.bad{}</style>';
        f.doc.querySelector('#messages')!.insertAdjacentHTML('beforeend', '<div id="m-2" class="tool">tool event</div>');
        await f.flush();
        expect(f.doc.querySelector('#m-2 [data-mobile-message-actions]')).toBeNull();
        (f.doc.querySelector('[data-mobile-message-actions]') as any).click();
        const copy = f.doc.querySelector('[data-mobile-message-copy]') as any;
        expect(f.doc.querySelector('dialog button')).toBe(copy);
        expect(f.doc.querySelectorAll('dialog [data-danger]').length).toBe(2);
        let copied = '';
        Object.defineProperty(f.window.navigator, 'clipboard', { value: { writeText: async (text: string) => { copied = text; } } });
        copy.click(); await f.flush();
        expect(copied).toBe('Hello world\nSecond');
        expect(f.doc.querySelector('dialog [role="status"]')?.textContent).toBe('Скопировано');
        Object.defineProperty(f.window.navigator.clipboard, 'writeText', { value: async () => { throw new Error('denied'); } });
        copy.click(); await f.flush();
        expect(f.doc.querySelector('dialog [role="status"]')?.textContent).toContain('Не удалось');
    } finally { await f.window.happyDOM.close(); }
});

test('real user/assistant renderers copy readable text and native lifecycle sizes history before listeners', async () => {
    const f = await setup();
    try {
        const ctx = { fns: { procs: { ui: { button: (o: any) => `<button data-action="${o.action}" hx-confirm="${o.attrs['hx-confirm']}">${o.html}</button>` } } } } as unknown as Context;
        const user = await renderEvent(ctx, null, { agentId: 'test', event: { type: 'user', idx: 3, text: 'Мой вопрос', ts: Date.now() } });
        const assistant = await renderEvent(ctx, null, { agentId: 'test', event: { type: 'assistant', idx: 4, html: '<p>Ответ</p><pre><code>'+Array(20).fill('const a = 1;').join('\n')+'</code></pre>', ts: Date.now() } });
        const messages = f.doc.getElementById('messages')!;
        messages.innerHTML = user + assistant + '<div id="m-5" class="tool">Tool event</div>';
        let sizedBeforeBubble = false;
        f.doc.addEventListener('htmx:after:swap', () => { sizedBeforeBubble = f.doc.querySelector('[data-chat-code-block]')?.getAttribute('data-code-collapsed') === 'true'; }, { once: true });
        f.doc.dispatchEvent(new f.window.CustomEvent('htmx:after:swap', { detail: { ctx: { target: messages } } }));
        expect(sizedBeforeBubble).toBe(true);
        expect(f.doc.querySelectorAll('[data-mobile-message-actions]').length).toBe(2);
        expect(f.doc.querySelector('#m-5 [data-mobile-message-actions]')).toBeNull();
        let copied = '';
        Object.defineProperty(f.window.navigator, 'clipboard', { value: { writeText: async (s: string) => { copied = s; } } });
        (f.doc.querySelector('#m-3 [data-mobile-message-actions]') as any).click();
        (f.doc.querySelector('[data-mobile-message-copy]') as any).click(); await f.flush();
        expect(copied).toBe('Мой вопрос');
        (f.doc.querySelector('[data-mobile-sheet-close]') as any).click();
        (f.doc.querySelector('#m-4 [data-mobile-message-actions]') as any).click();
        (f.doc.querySelector('[data-mobile-message-copy]') as any).click(); await f.flush();
        expect(copied).toContain('Ответ'); expect(copied).toContain('const a = 1;');
        expect(copied).not.toContain('Копировать'); expect(copied).not.toContain('Развернуть');
        f.doc.dispatchEvent(new f.window.CustomEvent('htmx:before:swap', { detail: { ctx: { target: messages } } }));
        expect(f.doc.querySelector('dialog')).toBeNull();
    } finally { await f.window.happyDOM.close(); }
});
