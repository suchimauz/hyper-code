import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

const source = await Bun.file(new URL('./$script_chat.js', import.meta.url)).text();

function fixture({ touch = true, width = 390, visualViewport = true } = {}) {
    const window = new Window({ url: 'http://local/agent/a', width, height: 844 });
    const document = window.document;
    Object.defineProperty(window.navigator, 'maxTouchPoints', { value: touch ? 5 : 0 });
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
    window.cancelAnimationFrame = id => { frames.delete(id); };
    const flush = () => {
        for (let count = 0; frames.size && count < 10; count++) {
            const pending = [...frames.values()];
            frames.clear();
            for (const callback of pending) callback(0);
        }
    };
    const viewport = Object.assign(new window.EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: visualViewport ? viewport : undefined });
    const panel = (id: string) => `<section id="chat-panel" data-agent-id="${id}"><div id="messages" data-agent-id="${id}"></div><form id="form" hx-post="/agent/${id}"><textarea id="input"></textarea></form></section>`;
    document.body.innerHTML = `<main id="main">${panel('a')}</main>`;
    let scrollTop = 1200;
    const bindMetrics = () => {
        const messages = document.querySelector('#messages')!;
        Object.defineProperties(messages, {
            scrollHeight: { get: () => 2000 },
            clientHeight: { get: () => (Number.parseFloat(document.documentElement.style.getPropertyValue('--chat-viewport-height')) || 844) - 100 },
            scrollTop: {
                get: () => scrollTop,
                set: value => { scrollTop = Math.max(0, Math.min(value, 2000 - messages.clientHeight)); },
            },
        });
        return messages;
    };
    bindMetrics();
    window.eval(source);
    flush();
    const resize = (height: number, offsetTop = 0, scale = 1) => {
        Object.assign(viewport, { height, offsetTop, scale });
        viewport.dispatchEvent(new window.Event('resize'));
        flush();
    };
    const scroll = (top: number) => {
        scrollTop = top;
        document.querySelector('#messages')!.dispatchEvent(new window.Event('scroll'));
    };
    const navigate = (id: string | null) => {
        const main = document.querySelector('#main')!;
        main.dispatchEvent(new window.Event('htmx:before:cleanup', { bubbles: true }));
        main.innerHTML = id ? panel(id) : '<p>Other page</p>';
        if (id) bindMetrics();
        document.dispatchEvent(new window.CustomEvent('htmx:after:swap', { detail: { ctx: { target: main } } }));
        flush();
    };
    return { window, document, viewport, flush, resize, scroll, navigate, get top() { return scrollTop; } };
}

describe('mobile chat viewport', () => {
    test('opening a touch chat does not focus the composer; desktop still focuses it', async () => {
        for (const touch of [true, false]) {
            const f = fixture({ touch, width: touch ? 390 : 1280 });
            try {
                expect(f.document.activeElement === f.document.querySelector('#input')).toBe(!touch);
            } finally { await f.window.happyDOM.close(); }
        }
    });

    test('keyboard opening and closing keeps the latest message visible', async () => {
        const f = fixture();
        try {
            expect(f.top).toBe(1256);
            f.resize(460, 12);
            expect(f.document.documentElement.style.getPropertyValue('--chat-viewport-height')).toBe('460px');
            expect(f.document.documentElement.style.getPropertyValue('--chat-viewport-top')).toBe('12px');
            expect(f.top).toBe(1640);
            f.resize(844);
            expect(f.top).toBe(1256);
        } finally { await f.window.happyDOM.close(); }
    });

    test('reading history retains its position through keyboard changes and later live swaps', async () => {
        const f = fixture();
        try {
            f.scroll(300);
            f.resize(460);
            expect(f.top).toBe(300);
            f.resize(844);
            expect(f.top).toBe(300);
            const messages = f.document.querySelector('#messages')!;
            f.document.dispatchEvent(new f.window.CustomEvent('htmx:after:swap', { detail: { ctx: { target: messages } } }));
            expect(f.top).toBe(300);
        } finally { await f.window.happyDOM.close(); }
    });

    test('manual pinch zoom does not resize or reposition the chat', async () => {
        const f = fixture();
        try {
            f.resize(460);
            const previousTop = f.top;
            f.resize(230, 50, 2);
            expect(f.document.documentElement.style.getPropertyValue('--chat-viewport-height')).toBe('460px');
            expect(f.document.documentElement.style.getPropertyValue('--chat-viewport-top')).toBe('0px');
            expect(f.top).toBe(previousTop);
            f.resize(844, 0, 1);
            expect(f.document.documentElement.style.getPropertyValue('--chat-viewport-height')).toBe('844px');
        } finally { await f.window.happyDOM.close(); }
    });

    test('landscape phones use visible height; desktop and missing API retain CSS sizing', async () => {
        for (const config of [
            { touch: true, width: 844, visualViewport: true, expected: true },
            { touch: false, width: 1280, visualViewport: true, expected: false },
            { touch: true, width: 390, visualViewport: false, expected: false },
        ]) {
            const f = fixture(config);
            try {
                expect(f.document.documentElement.hasAttribute('data-chat-viewport')).toBe(config.expected);
            } finally { await f.window.happyDOM.close(); }
        }
    });

    test('navigation removes old viewport state and callbacks and remounts cleanly', async () => {
        const f = fixture();
        try {
            f.resize(460);
            // Leave while a viewport animation callback is queued.
            f.viewport.height = 400;
            f.viewport.dispatchEvent(new f.window.Event('resize'));
            f.navigate(null);
            expect(f.document.documentElement.hasAttribute('data-chat-viewport')).toBe(false);
            expect(f.document.documentElement.style.getPropertyValue('--chat-viewport-height')).toBe('');
            f.resize(700);
            expect(f.document.documentElement.style.getPropertyValue('--chat-viewport-height')).toBe('');
            f.navigate('b');
            expect(f.document.documentElement.style.getPropertyValue('--chat-viewport-height')).toBe('700px');
            expect(f.document.activeElement).not.toBe(f.document.querySelector('#input'));
        } finally { await f.window.happyDOM.close(); }
    });
});

test('editing begins only with focused composer and keyboard-sized viewport shrink, ends on close or blur',async()=>{
 const f=fixture();try{
  const d=f.window.document,panel=d.querySelector('#chat-panel')!,input=d.querySelector('#input') as any;
  input.focus();f.resize(800);expect(panel.hasAttribute('data-chat-editing')).toBe(false);
  f.resize(480);expect(panel.hasAttribute('data-chat-editing')).toBe(true);
  f.resize(470);expect(panel.hasAttribute('data-chat-editing')).toBe(true);
  input.blur();expect(panel.hasAttribute('data-chat-editing')).toBe(false);
  input.focus();f.resize(480);expect(panel.hasAttribute('data-chat-editing')).toBe(true);
  f.resize(844);expect(panel.hasAttribute('data-chat-editing')).toBe(false);
  input.blur();f.resize(480);expect(panel.hasAttribute('data-chat-editing')).toBe(false);
 }finally{await f.window.happyDOM.close();}
});
