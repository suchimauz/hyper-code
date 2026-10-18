import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import composer from '../ui/chatComposer';

const script = await Bun.file(new URL('./$script_chat.js', import.meta.url)).text();
const ctx = { fns: { procs: { ui: { attr: () => '' } } } } as unknown as Context;
const row = (idx: number, text = 'Reply') => `<div id="m-${idx}"><div class="assistant">${text}</div></div>`;
async function fixture() {
    const w = new Window({ url: 'https://hyper.test/agent/a', width: 390, height: 844 });
    Object.defineProperty(w.navigator, 'maxTouchPoints', { value: 5 });
    let height = 2000, top = 0;
    const frames = new Map<number, FrameRequestCallback>(); let sequence = 0;
    w.requestAnimationFrame = callback => { frames.set(++sequence, callback); return sequence; };
    w.cancelAnimationFrame = id => { frames.delete(id); };
    const flush = () => { for (let i = 0; frames.size && i < 10; i++) { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(0)); } };
    w.document.body.innerHTML = `<main id="main"><section id="chat-panel" data-agent-id="a"><div id="messages" data-agent-id="a">${row(10)}${row(11)}<div id="msg-tail"></div></div>${await composer(ctx, null, { action: '/agent/a' })}</section></main>`;
    const messages = w.document.getElementById('messages')!;
    Object.defineProperties(messages, {
        scrollHeight: { get: () => height }, clientHeight: { get: () => 500 },
        scrollTop: { get: () => top, set: value => { top = Math.max(0, Math.min(value, height - 500)); } },
    });
    const button = w.document.querySelector('[data-chat-jump]')! as any;
    const count = w.document.querySelector('[data-chat-jump-count]')! as any;
    const status = w.document.querySelector('[data-chat-jump-status]')!;
    const input = w.document.getElementById('input')! as any;
    const scroll = (value: number) => { messages.scrollTop = value; messages.dispatchEvent(new w.Event('scroll')); flush(); };
    const swap = (html: string, mode = 'tail') => {
        const target = mode === 'head' ? messages.firstElementChild! : mode === 'tail' ? w.document.getElementById('msg-tail')! : messages;
        if (mode === 'head') target.id = 'msg-head';
        const detail = { ctx: { target, sourceElement: target } };
        w.document.dispatchEvent(new w.CustomEvent('htmx:before:swap', { detail }));
        if (mode === 'head') { target.insertAdjacentHTML('afterend', html); target.remove(); }
        else if (mode === 'tail') { target.insertAdjacentHTML('beforebegin', html); target.replaceWith(w.document.createElement('div')); messages.lastElementChild!.id = 'msg-tail'; }
        else messages.innerHTML = html + '<div id="msg-tail"></div>';
        height += 200;
        w.document.dispatchEvent(new w.CustomEvent('htmx:after:swap', { detail })); flush();
    };
    w.eval(script); flush();
    return { w, messages, button, count, status, input, flush, scroll, swap, get top() { return top; } };
}

test('history offers return without a count; bottom hides it without resizing or focusing', async () => {
    const f = await fixture();
    try {
        expect(f.button.hidden).toBe(true);
        f.scroll(500);
        expect(f.button.hidden).toBe(false);
        expect(f.count.hidden).toBe(true);
        expect(f.status.textContent).toBe('');
        expect(f.top).toBe(500);
        f.scroll(1500);
        expect(f.button.hidden).toBe(true);
        expect(f.w.document.activeElement).not.toBe(f.input);
    } finally { await f.w.happyDOM.close(); }
});

test('batched replies increment once; tool polls and rerenders never inflate the count or move history', async () => {
    const f = await fixture();
    try {
        f.scroll(500); f.swap(row(12) + row(13));
        expect(f.top).toBe(500); expect(f.count.textContent).toBe('2');
        expect(f.button.getAttribute('aria-label')).toContain('Новых сообщений: 2');
        f.swap('<a class="tool">Tool status</a>');
        expect(f.count.textContent).toBe('2'); expect(f.top).toBe(500);
        f.swap(row(10) + row(11) + row(12, 'Updated') + row(13, 'More tokens'), 'replace');
        expect(f.count.textContent).toBe('2'); expect(f.top).toBe(500);
        f.swap(row(14)); expect(f.count.textContent).toBe('3');
    } finally { await f.w.happyDOM.close(); }
});

test('older history and nested model markup do not count as new conversation messages', async () => {
    const f = await fixture();
    try {
        f.scroll(500); f.swap(row(5) + row(6), 'head');
        expect(f.count.hidden).toBe(true); expect(f.top).toBe(500);
        f.swap('<div class="tool"><div id="m-9999">not a transcript message</div></div>');
        expect(f.count.hidden).toBe(true);
        f.swap(row(12)); expect(f.count.textContent).toBe('1');
    } finally { await f.w.happyDOM.close(); }
});

test('return clears the counter and reaches bottom without sending, focusing, or modifying draft', async () => {
    const f = await fixture();
    try {
        let submitted = 0; f.w.document.querySelector('form')!.addEventListener('submit', () => submitted++);
        f.input.value = 'Unsent text'; f.input.setSelectionRange(2, 6);
        f.scroll(500); f.swap(row(12)); f.button.click();
        expect(f.top).toBe(1700); expect(f.button.hidden).toBe(true); expect(f.count.hidden).toBe(true);
        expect(f.status.textContent).toBe(''); expect(submitted).toBe(0);
        expect(f.input.value).toBe('Unsent text'); expect(f.input.selectionStart).toBe(2);
        expect(f.w.document.activeElement).not.toBe(f.input);
        f.swap('<a class="tool">new tool</a>'); expect(f.top).toBe(1900);
        f.scroll(600); f.swap(row(13)); expect(f.top).toBe(600); expect(f.count.textContent).toBe('1');
    } finally { await f.w.happyDOM.close(); }
});

test('manual arrival at bottom clears pending messages; deleting a pending message removes its count', async () => {
    const f = await fixture();
    try {
        f.scroll(500); f.swap(row(12) + row(13));
        f.swap(row(10) + row(11) + row(13), 'replace'); expect(f.count.textContent).toBe('1');
        f.scroll(99999); expect(f.button.hidden).toBe(true); expect(f.count.hidden).toBe(true);
        f.scroll(500); expect(f.count.hidden).toBe(true);
    } finally { await f.w.happyDOM.close(); }
});

test('following a new answer does not mark it unread; same-message redraw does not reclaim scroll', async () => {
    const f = await fixture();
    try {
        f.swap(row(12)); expect(f.count.hidden).toBe(true);
        f.scroll(700); f.swap(row(10) + row(11) + row(12, 'Updated'), 'replace');
        expect(f.top).toBe(700); expect(f.count.hidden).toBe(true);
    } finally { await f.w.happyDOM.close(); }
});

test('disposed controllers ignore old return buttons and queued updates', async () => {
    const f = await fixture();
    try {
        f.scroll(500); f.swap(row(12));
        f.w.document.getElementById('main')!.dispatchEvent(new f.w.Event('htmx:before:cleanup', { bubbles: true }));
        f.button.click(); f.flush(); expect(f.top).toBe(500);
    } finally { await f.w.happyDOM.close(); }
});
