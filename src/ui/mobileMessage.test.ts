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
        const trigger = f.doc.querySelector('.mobile-message-enhanced') as any;
        expect(trigger).not.toBeNull();
        const original = f.doc.querySelector('[data-action="delete-one"]')!;
        let called = 0;
        original.addEventListener('click', () => { called++; expect(original.getAttribute('hx-confirm')).toBe('delete this message?'); });
        trigger.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
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
        expect(f.doc.querySelector('.chat-code-status')?.textContent).toBe('Скопировано');
        expect(f.doc.querySelector('.chat-code-status')?.classList.contains('sr-only')).toBe(true);
        expect(f.doc.querySelector('[data-code-copy]')?.getAttribute('data-copied')).toBe('true');
        expect(f.doc.querySelector('.chat-code-feedback')?.hasAttribute('hidden')).toBe(true);
        expect(pre.textContent).toBe(text);
        Object.defineProperty(f.window.navigator.clipboard, 'writeText', { value: async () => { throw new Error('denied'); } });
        (f.doc.querySelector('[data-code-copy]') as any).click();
        await f.flush();
        expect(f.doc.querySelector('.chat-code-status')?.textContent).toContain('Не удалось');
        expect(f.doc.querySelector('.chat-code-error')?.textContent).toContain('Не удалось');
        expect(f.doc.querySelector('.chat-code-feedback')?.hasAttribute('hidden')).toBe(false);
    } finally { await f.window.happyDOM.close(); }
});

test('HTMX replacement closes sheet; repeated script does not duplicate enhancements', async () => {
    const f = await setup();
    try {
        f.window.eval(source);
        f.doc.dispatchEvent(new f.window.Event('htmx:afterSwap'));
        await f.flush();
        expect(f.doc.querySelectorAll('.mobile-message-enhanced').length).toBe(1);
        expect(f.doc.querySelectorAll('.chat-code-tools').length).toBe(1);
        f.doc.querySelector('.mobile-message-enhanced')!.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
        f.doc.querySelector('#messages')!.innerHTML = '';
        await f.flush();
        expect(f.doc.querySelector('dialog')).toBeNull();
    } finally { await f.window.happyDOM.close(); }
});

test('desktop gets code controls and universal message actions', async () => {
    const f = await setup(1280);
    try {
        expect(f.doc.querySelector('.mobile-message-enhanced')).not.toBeNull();
        expect(f.doc.querySelector('.chat-code-tools')).not.toBeNull();
        expect(f.doc.querySelector('pre')?.getAttribute('tabindex')).toBe('0');
    } finally { await f.window.happyDOM.close(); }
});

test('cancel closes sheet and restores message focus', async () => {
    const f = await setup();
    try {
        const trigger = f.doc.querySelector('.mobile-message-enhanced') as any;
        trigger.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
        f.doc.querySelector('dialog')!.dispatchEvent(new f.window.Event('cancel', { cancelable: true }));
        expect(f.doc.querySelector('dialog')).toBeNull();
        expect(f.doc.activeElement).toBe(trigger);
    } finally { await f.window.happyDOM.close(); }
});


test('actions support mobile, touch landscape and fine-pointer desktop', async () => {
    for (const [width, coarse, expected] of [[700, false, true], [844, true, true], [1023, true, true], [844, false, true], [1024, true, true]] as const) {
        const f = await setup(width, coarse);
        try {
            expect(!!f.doc.querySelector('.mobile-message-enhanced')).toBe(expected);
        } finally { await f.window.happyDOM.close(); }
    }
});

test('inspector dialog takes priority without mobile sheet stealing focus', async () => {
    const f = await setup();
    try {
        const trigger = f.doc.querySelector('.mobile-message-enhanced') as any;
        const inspector = f.doc.createElement('dialog');
        const control = f.doc.createElement('button');
        control.textContent = 'Inspector';
        inspector.append(control);
        f.doc.body.append(inspector);
        inspector.showModal();
        control.focus();
        trigger.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
        expect(f.doc.querySelector('.mobile-message-sheet')).toBeNull();
        inspector.close();
        trigger.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
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
        expect(f.doc.querySelector('#m-2.mobile-message-enhanced')).toBeNull();
        f.doc.querySelector('.mobile-message-enhanced')!.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
        const copy = f.doc.querySelector('[data-mobile-message-copy]') as any;
        expect(f.doc.querySelector('dialog button')).toBe(copy);
        expect(f.doc.querySelectorAll('dialog [data-danger]').length).toBe(2);
        expect([...f.doc.querySelectorAll('dialog button > i')].map(icon => icon.className)).toEqual(['ph ph-copy', 'ph ph-trash', 'ph ph-list-dashes', 'ph ph-x']);
        expect(f.doc.querySelectorAll('dialog button > i[aria-hidden="true"]').length).toBe(4);
        let copied = '';
        Object.defineProperty(f.window.navigator, 'clipboard', { value: { writeText: async (text: string) => { copied = text; } } });
        copy.click(); await f.flush();
        expect(copied).toBe('Hello world\nSecond');
        expect(f.doc.querySelector('dialog')).toBeNull();
        expect(f.doc.activeElement === f.doc.querySelector('#m-1')).toBe(true);
        f.doc.querySelector('#m-1')!.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
        Object.defineProperty(f.window.navigator.clipboard, 'writeText', { value: async () => { throw new Error('denied'); } });
        (f.doc.querySelector('[data-mobile-message-copy]') as any).click(); await f.flush();
        expect(f.doc.querySelector('dialog [role="status"]')?.textContent).toContain('Не удалось');
    } finally { await f.window.happyDOM.close(); }
});

test('pending message copy does not close a newer context menu', async () => {
    const f = await setup();
    try {
        let finish: () => void = () => {};
        Object.defineProperty(f.window.navigator, 'clipboard', { value: { writeText: () => new Promise<void>(resolve => { finish = resolve; }) } });
        const trigger = f.doc.querySelector('#m-1')!;
        const open = () => trigger.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
        open();
        const copy = f.doc.querySelector('[data-mobile-message-copy]') as any;
        copy.click();
        expect(copy.disabled).toBe(true);
        f.doc.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        open();
        const current = f.doc.querySelector('dialog');
        finish(); await f.flush();
        expect(f.doc.querySelector('dialog')).toBe(current);
        expect(current?.hasAttribute('open')).toBe(true);
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
        expect(f.doc.querySelectorAll('.mobile-message-enhanced').length).toBe(2);
        expect(f.doc.querySelector('#m-5.mobile-message-enhanced')).toBeNull();
        let copied = '';
        Object.defineProperty(f.window.navigator, 'clipboard', { value: { writeText: async (s: string) => { copied = s; } } });
        f.doc.querySelector('#m-3.mobile-message-enhanced')!.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
        (f.doc.querySelector('[data-mobile-message-copy]') as any).click(); await f.flush();
        expect(copied).toBe('Мой вопрос');
        expect(f.doc.querySelector('dialog')).toBeNull();
        f.doc.querySelector('#m-4.mobile-message-enhanced')!.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
        (f.doc.querySelector('[data-mobile-message-copy]') as any).click(); await f.flush();
        expect(copied).toContain('Ответ'); expect(copied).toContain('const a = 1;');
        expect(copied).not.toContain('Копировать'); expect(copied).not.toContain('Развернуть');
        f.doc.dispatchEvent(new f.window.CustomEvent('htmx:before:swap', { detail: { ctx: { target: messages } } }));
        expect(f.doc.querySelector('dialog')).toBeNull();
    } finally { await f.window.happyDOM.close(); }
});

// Advance only the 520ms gesture timer, avoiding slow and flaky sleeps.
async function gestures(width = 1280) {
    const f = await setup(width);
    let pending: (() => void) | null = null;
    const realSet = f.window.setTimeout.bind(f.window);
    const realClear = f.window.clearTimeout.bind(f.window);
    f.window.setTimeout = ((fn: () => void, ms: number, ...args: any[]) => {
        if (ms === 520) { pending = fn; return 987654; }
        return realSet(fn, ms, ...args);
    }) as any;
    f.window.clearTimeout = ((id: any) => { if (id === 987654) pending = null; else realClear(id); }) as any;
    f.doc.querySelector('.assistant')!.insertAdjacentHTML('afterbegin', '<p id="plain">Readable message</p>');
    const target = f.doc.querySelector('#plain')!;
    const pointer = (type: string, el: any = target, extra = {}) => {
        const event = new f.window.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, clientX: 30, clientY: 30, ...extra });
        el.dispatchEvent(event);
        return event;
    };
    return { ...f, target, pointer, fire: () => { const fn = pending; pending = null; fn?.(); } };
}

test('primary hold opens desktop/mobile; release, nonprimary, movement, scroll and cleanup cancel', async () => {
    for (const width of [390, 1280]) {
        for (const reason of ['open', 'pointerup', 'pointercancel', 'movement', 'scroll', 'dragstart', 'selection', 'blur', 'resize', 'remove', 'cleanup', 'swap', 'secondary', 'nonprimary']) {
            const f = await gestures(width);
            try {
                const extra = reason === 'secondary' ? { button: 2 } : reason === 'nonprimary' ? { isPrimary: false } : {};
                expect(f.pointer('pointerdown', f.target, extra).defaultPrevented).toBe(false);
                if (reason === 'movement') f.pointer('pointermove', f.target, { clientX: 39 });
                else if (reason === 'open') f.pointer('pointermove', f.target, { clientX: 38 });
                else if (reason === 'selection') {
                    const range = f.doc.createRange(); range.selectNodeContents(f.target);
                    f.window.getSelection()!.addRange(range);
                    f.doc.dispatchEvent(new f.window.Event('selectionchange'));
                } else if (reason === 'blur' || reason === 'resize') f.window.dispatchEvent(new f.window.Event(reason));
                else if (reason === 'remove') f.doc.querySelector('#m-1')!.remove();
                else if (reason === 'cleanup' || reason === 'swap') {
                    const message = f.doc.querySelector('#m-1');
                    f.doc.dispatchEvent(new f.window.CustomEvent(reason === 'cleanup' ? 'htmx:beforeCleanupElement' : 'htmx:before:swap', { detail: { elt: message, ctx: { target: message } } }));
                } else if (!['secondary', 'nonprimary'].includes(reason)) f.target.dispatchEvent(new f.window.Event(reason, { bubbles: true }));
                f.fire();
                expect(!!f.doc.querySelector('dialog[open]')).toBe(reason === 'open');
                if (reason === 'scroll') { f.pointer('pointerdown'); f.fire(); expect(f.doc.querySelector('dialog')).toBeNull(); }
                if (reason === 'open') {
                    f.doc.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    expect(f.doc.querySelector('dialog')).toBeNull();
                    expect(f.doc.activeElement).toBe(f.doc.querySelector('.mobile-message-enhanced') as unknown as typeof f.doc.activeElement);
                }
            } finally { await f.window.happyDOM.close(); }
        }
    }
});

test('native code, links, forms and input cards retain hold and context-menu behavior', async () => {
    const f = await gestures();
    try {
        f.target.innerHTML = '<a href="#">Link</a><code>Code</code><pre>Pre</pre><input><textarea></textarea><select></select><form><span>Form</span></form><div contenteditable="true">Edit</div><div data-input-card><span>Card</span></div><div data-input-kind="confirm"><span>Input card body</span></div><button>Button</button>';
        for (const target of f.target.querySelectorAll('*')) {
            f.pointer('pointerdown', target); f.fire();
            const menu = new f.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
            target.dispatchEvent(menu);
            expect(menu.defaultPrevented).toBe(false);
            expect(f.doc.querySelector('dialog')).toBeNull();
        }
    } finally { await f.window.happyDOM.close(); }
});

test('right click and Shift+F10 open accessible dialog; resize closes without losing enhancement', async () => {
    const f = await gestures();
    try {
        const event = new f.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        f.target.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(f.doc.querySelector('dialog')?.getAttribute('aria-label')).toBe('Действия с сообщением');
        f.window.dispatchEvent(new f.window.Event('resize'));
        expect(f.doc.querySelector('dialog')).toBeNull();
        const trigger = f.doc.querySelector('.mobile-message-enhanced')!;
        trigger.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
        expect(f.doc.querySelector('dialog[open]')).not.toBeNull();
    } finally { await f.window.happyDOM.close(); }
});

test('tool messages with authorized controls are enhanced and copy plain fallback text', async () => {
    const f = await setup(1280);
    try {
        f.doc.querySelector('#messages')!.innerHTML = '<div id="m-8" class="tool"><div>Tool result</div><button data-action="delete-one" disabled hx-confirm="sure?">Delete</button></div>';
        await f.flush();
        f.doc.querySelector('.mobile-message-enhanced')!.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
        expect((f.doc.querySelector('[data-mobile-sheet-action]') as any).disabled).toBe(true);
        let copied = '';
        Object.defineProperty(f.window.navigator, 'clipboard', { value: { writeText: async (s: string) => { copied = s; } } });
        (f.doc.querySelector('[data-mobile-message-copy]') as any).click(); await f.flush();
        expect(copied).toBe('Tool result');
    } finally { await f.window.happyDOM.close(); }
});


test('message itself is keyboard origin without ellipsis or ordinary click interception', async () => {
    const f = await setup();
    try {
        const message = f.doc.querySelector('#m-1')!;
        expect(message.getAttribute('tabindex')).toBe('0');
        expect(message.getAttribute('aria-keyshortcuts')).toBe('Shift+F10');
        expect(message.getAttribute('aria-haspopup')).toBe('dialog');
        expect(message.hasAttribute('role')).toBe(false);
        expect(f.doc.querySelector('[data-mobile-message-actions]')).toBeNull();
        expect(message.textContent).not.toContain('⋯');
        let bubbled = 0;
        f.doc.addEventListener('click', () => { bubbled++; });
        const click = new f.window.MouseEvent('click', { bubbles: true, cancelable: true });
        message.dispatchEvent(click);
        expect(click.defaultPrevented).toBe(false);
        expect(bubbled).toBe(1);
        expect(f.doc.querySelector('dialog')).toBeNull();
        message.insertAdjacentHTML('beforeend', '<button data-mobile-message-actions>⋯</button>');
        await f.flush();
        expect(f.doc.querySelector('[data-mobile-message-actions]')).toBeNull();
        expect(message.textContent).not.toContain('⋯');
    } finally { await f.window.happyDOM.close(); }
});


test('nonmodal popover anchors at pointer, clamps viewport and keeps page interactive', async () => {
    const f = await setup();
    try {
        let modalCalls = 0;
        const proto = f.window.HTMLDialogElement.prototype;
        const originalModal = proto.showModal;
        proto.showModal = function () { modalCalls++; originalModal.call(this); };
        const message = f.doc.querySelector('#m-1')!;
        message.dispatchEvent(new f.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10000, clientY: 10000 }));
        const popup = f.doc.querySelector('dialog')!;
        expect(modalCalls).toBe(0);
        expect(popup.open).toBe(true);
        expect(popup.style.position).toBe('fixed');
        expect(Number.parseFloat(popup.style.left)).toBeLessThanOrEqual(f.window.innerWidth - 8);
        expect(Number.parseFloat(popup.style.top)).toBeLessThanOrEqual(f.window.innerHeight - 8);
        expect(popup.style.maxHeight).toBe('828px');
        expect(f.doc.activeElement?.hasAttribute('data-mobile-message-copy')).toBe(true);
        expect(f.doc.querySelector('[inert]')).toBeNull();
        const outside = new f.window.PointerEvent('pointerdown', { bubbles: true, cancelable: true });
        f.doc.body.dispatchEvent(outside);
        expect(outside.defaultPrevented).toBe(false);
        expect(f.doc.querySelector('dialog')).toBeNull();
        expect(f.doc.activeElement?.id).toBe('m-1');
        message.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
        expect(f.doc.querySelector('dialog')).not.toBeNull();
        f.doc.dispatchEvent(new f.window.Event('scroll'));
        expect(f.doc.querySelector('dialog')).toBeNull();
    } finally { await f.window.happyDOM.close(); }
});
