import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';

const script = await Bun.file(new URL('./$script_chat.js', import.meta.url)).text();
const markup = '<table><caption>Задачи проекта</caption><thead><tr><th>ID</th><th>Задача</th></tr></thead><tbody><tr><td>141811</td><td><a href="/issues/141811">Описание задачи</a></td></tr></tbody></table>';
function fixture() {
    const w = new Window({ url: 'https://local/agent/a', width: 390, height: 844 });
    Object.defineProperty(w.navigator, 'maxTouchPoints', { value: 5 });
    w.requestAnimationFrame = () => 0;
    w.document.body.innerHTML = `<section id="chat-panel"><div id="messages"><div id="m-1"><div class="assistant"><div class="prose">${markup}</div></div></div><div id="msg-tail"></div></div><form id="form" hx-post="/agent/a"><textarea id="input"></textarea></form></section>`;
    const table = w.document.querySelector('table')!;
    const link = w.document.querySelector('a')!;
    w.eval(script);
    const swap = (target: Element) => w.document.dispatchEvent(new w.CustomEvent('htmx:after:swap', { detail: { ctx: { target, sourceElement: target } } }));
    return { w, table, link, swap };
}

test('tables gain one accessible scroll wrapper, retaining table semantics, links and text', async () => {
    const f = fixture();
    try {
        const scroll = f.w.document.querySelector('.chat-table-scroll')!;
        expect(scroll.getAttribute('role')).toBe('region');
        expect(scroll.getAttribute('aria-label')).toBe('Задачи проекта');
        expect(scroll.getAttribute('tabindex')).toBe('0');
        expect(scroll.firstElementChild).toBe(f.table);
        expect(f.w.document.querySelector('a')).toBe(f.link);
        expect(f.table.querySelectorAll('th').length).toBe(2);
        expect(f.table.textContent).toContain('141811');
        expect(f.w.document.querySelector('.chat-table-hint')!.hasAttribute('data-no-copy')).toBe(true);
        expect(f.w.document.querySelector('.chat-table-hint')!.getAttribute('aria-hidden')).toBe('true');
        (scroll as any).scrollLeft = 100;
        f.swap(f.w.document.getElementById('messages')!);
        expect(f.w.document.querySelectorAll('.chat-table-scroll').length).toBe(1);
        expect((scroll as any).scrollLeft).toBe(100);
    } finally { await f.w.happyDOM.close(); }
});

test('live and older transcript fragments get wrappers, but controls and nested tables do not', async () => {
    const f = fixture();
    try {
        const messages = f.w.document.getElementById('messages')!;
        const tail = f.w.document.getElementById('msg-tail')!;
        tail.insertAdjacentHTML('beforebegin', `<div id="m-2"><div class="assistant"><div class="prose">${markup}</div></div></div>`);
        f.swap(tail);
        expect(messages.querySelectorAll('.chat-table-scroll').length).toBe(2);
        messages.insertAdjacentHTML('afterbegin', `<div id="msg-head"></div><div id="m-0"><div class="prose"><table><tbody><tr><td><table><tr><td>Nested</td></tr></table></td></tr></tbody></table></div></div>`);
        f.swap(f.w.document.getElementById('msg-head')!);
        expect(messages.querySelectorAll('.chat-table-scroll').length).toBe(3);
        expect(messages.querySelector('table table')!.closest('.chat-table-scroll')).toBe(messages.querySelector('#m-0 .chat-table-scroll'));
        f.w.document.getElementById('form')!.insertAdjacentHTML('beforeend', markup);
        f.swap(f.w.document.getElementById('form')!);
        expect(f.w.document.querySelector('#form .chat-table-scroll')).toBeNull();
    } finally { await f.w.happyDOM.close(); }
});

test('copying a table omits the scroll hint and retains HTML rows', async () => {
    const f = fixture();
    try {
        const block = f.w.document.querySelector('.chat-table-block')!;
        const range = f.w.document.createRange(); range.selectNodeContents(block);
        f.w.getSelection()!.addRange(range);
        const copied: Record<string, string> = {};
        const event = new f.w.Event('copy', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clipboardData', { value: { setData: (kind: string, text: string) => { copied[kind] = text; } } });
        block.dispatchEvent(event);
        expect(copied['text/html']).toContain('<table>');
        expect(copied['text/html']).toContain('141811');
        expect(copied['text/plain']).not.toContain('листать');
        expect(copied['text/html']).not.toContain('листать');
    } finally { await f.w.happyDOM.close(); }
});
