import { expect, test } from 'bun:test';
import { Window, HTMLElement } from 'happy-dom';
const source = await Bun.file(new URL('./$script_chat.js', import.meta.url)).text();
function fixture(width = 390, count = 8) {
    const w = new Window({ url: 'http://local/agent/a', width }), d = w.document;
    w.requestAnimationFrame = (() => 0) as unknown as typeof w.requestAnimationFrame;
    d.body.innerHTML = '<section id="chat-panel" data-agent-id="a"><div id="messages">' + Array.from({ length: count }, (_, i) => `<a href="#tool-${i}" class="tool tool-tucked ${i === 1 || i === count - 1 ? 'text-error' : ''}" ${i === 1 ? 'data-error="1"' : ''} data-tool="tool${i}">${i}</a>`).join('') + '<div id="active-tool-call"><a class="tool" data-tool="active">Active</a></div></div><form id="form" hx-post="/agent/a"><textarea id="input"></textarea></form></section>';
    w.eval(source);
    return { w, d };
}
for (const width of [390, 1280]) {
    for (const count of [1, 2, 3, 4, 5, 8]) test(`tray ${count} calls at ${width}: all up to four, otherwise latest three including errors`, async () => {
        const f = fixture(width, count);
        try {
            const tray = f.d.querySelector('.tool-tray')!;
            const toggle = tray.querySelector('.tool-tray-toggle:not(.tool-tray-collapse)') as HTMLElement | null;
            const tools = [...tray.children].filter(t => t.matches('.tool[data-tool]'));
            expect(tools).toHaveLength(count);
            expect(tray.querySelectorAll('.tool-history')).toHaveLength(count > 4 ? count - 3 : 0);
            expect(tools.filter(t => !t.classList.contains('tool-history')).map(t => t.getAttribute('data-tool'))).toEqual(Array.from({ length: count > 4 ? 3 : count }, (_, i) => `tool${(count > 4 ? count - 3 : 0) + i}`));
            expect(tray.querySelector('#active-tool-call')).not.toBeNull();
            if (count <= 4) {
                expect(toggle).toBeNull();
                expect(tray.querySelector('.tool-tray-collapse')).toBeNull();
                expect(tray.querySelector('[aria-hidden="true"]')).toBeNull();
                return;
            }
            expect(toggle!.getAttribute('aria-expanded')).toBe('false');
            expect(tray.querySelector('[data-error]')?.getAttribute('aria-hidden')).toBe('true');
            const footer = tray.querySelector('.tool-tray-collapse') as HTMLElement;
            expect(footer.hidden).toBe(true);
            toggle!.click();
            expect(toggle!.getAttribute('aria-expanded')).toBe('true');
            expect(tray.querySelectorAll('[aria-hidden="true"].tool-history')).toHaveLength(0);
            expect(footer.textContent).toBe('');
            expect(footer.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
            expect(footer.getAttribute('aria-label')).toContain('Скрыть список');
            expect(footer.getAttribute('title')).toBe('Свернуть вызовы');
            expect(footer.hidden).toBe(false);
            expect(tray.lastElementChild === footer).toBe(true);
            let scrolled = false;
            (tray as HTMLElement).scrollIntoView = () => { scrolled = true; };
            footer.focus(); footer.click();
            expect(scrolled).toBe(true);
            expect(f.d.activeElement === toggle).toBe(true);
            expect(footer.hidden).toBe(true);
            expect(toggle!.getAttribute('aria-expanded')).toBe('false');
            toggle!.click(); expect(footer.hidden).toBe(false);
            const replacement = toggle!.cloneNode(true) as HTMLElement; toggle!.replaceWith(replacement);
            replacement.click(); expect(tray.classList.contains('tool-tray--folded')).toBe(true);
            expect(f.d.querySelector('#input') === f.d.activeElement).toBe(false);
        } finally { await f.w.happyDOM.close(); }
    });
}
