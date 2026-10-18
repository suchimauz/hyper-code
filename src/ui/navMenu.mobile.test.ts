import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import navMenu from './navMenu';

function setup({ touch = true, width = 390 } = {}) {
    const window = new Window({ url: 'http://localhost/files', width, height: 844 });
    Object.defineProperty(window.navigator, 'maxTouchPoints', { value: touch ? 5 : 0 });
    const viewport = Object.assign(new window.EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: viewport });
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
    window.cancelAnimationFrame = id => { frames.delete(id); };
    const flush = () => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); };
    const html = navMenu({} as Context, null, {});
    window.document.body.innerHTML = '<button id="opener">Menu</button><textarea id="input"></textarea>' + html;
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.eval(window.document.querySelector('script')!.textContent!);
    const client = window as typeof window & { __navOpen(): void; __navClose(): void; __navIsOpen(): boolean };
    const opener = window.document.getElementById('opener')!;
    const query = window.document.getElementById('nav-q')!;
    const overlay = window.document.getElementById('nav-overlay')!;
    const resize = (height: number, offsetTop = 0, scale = 1) => {
        Object.assign(viewport, { height, offsetTop, scale });
        viewport.dispatchEvent(new window.Event('resize')); flush();
    };
    return { window, client, opener, query, overlay, resize, flush };
}

describe('mobile navigation menu', () => {
    test('touch opening focuses the dialog, not search, and closing returns to its button', async () => {
        const f = setup();
        try {
            f.opener.focus(); f.client.__navOpen();
            expect(f.client.__navIsOpen()).toBe(true);
            expect(f.window.document.activeElement?.getAttribute('role')).toBe('dialog');
            expect(f.window.document.activeElement).not.toBe(f.query);
            f.window.document.getElementById('nav-close')!.click();
            expect(f.client.__navIsOpen()).toBe(false);
            expect(f.window.document.activeElement).toBe(f.opener);
            expect(f.overlay.style.height).toBe('');
        } finally { await f.window.happyDOM.close(); }
    });

    test('closing search never refocuses the composer on touch', async () => {
        const f = setup();
        try {
            const input = f.window.document.getElementById('input')!;
            input.focus(); f.client.__navOpen(); f.query.focus();
            f.client.__navClose();
            expect(f.window.document.activeElement).not.toBe(input);
            expect(f.window.document.activeElement).not.toBe(f.query);
            expect(f.client.__navIsOpen()).toBe(false);
        } finally { await f.window.happyDOM.close(); }
    });

    test('desktop opening keeps instant search and Escape restores the prior focus', async () => {
        const f = setup({ touch: false, width: 1280 });
        try {
            f.opener.focus(); f.client.__navOpen();
            expect(f.window.document.activeElement).toBe(f.query);
            expect(f.overlay.style.height).toBe('');
            f.window.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape' }));
            expect(f.client.__navIsOpen()).toBe(false);
            expect(f.window.document.activeElement).toBe(f.opener);
        } finally { await f.window.happyDOM.close(); }
    });

    test('menu fits above keyboard on ordinary pages and landscape phones; pinch zoom stays native', async () => {
        for (const width of [390, 844]) {
            const f = setup({ width });
            try {
                f.client.__navOpen(); f.query.focus(); f.resize(410, 14);
                expect(f.overlay.style.height).toBe('410px');
                expect(f.overlay.style.top).toBe('14px');
                expect(f.overlay.style.bottom).toBe('auto');
                f.resize(205, 40, 2);
                expect(f.overlay.style.height).toBe('410px');
                expect(f.overlay.style.top).toBe('14px');
                f.client.__navClose(); f.resize(844);
                expect(f.overlay.style.height).toBe('');
                expect(f.overlay.style.top).toBe('');
                expect(f.overlay.style.bottom).toBe('');
                f.client.__navOpen();
                expect(f.overlay.style.height).toBe('844px');
            } finally { await f.window.happyDOM.close(); }
        }
    });

    test('backdrop closes the menu and the close button does not hijack Enter as navigation', async () => {
        const f = setup();
        try {
            f.client.__navOpen(); f.overlay.click();
            expect(f.client.__navIsOpen()).toBe(false);
            f.client.__navOpen();
            const close = f.window.document.getElementById('nav-close')!;
            expect(close.getAttribute('aria-label')).toBe('Close menu');
            close.focus();
            const key = new f.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
            close.dispatchEvent(key);
            expect(key.defaultPrevented).toBe(false);
            const theme = f.window.document.getElementById('nav-theme-toggle')!;
            theme.focus();
            const themeKey = new f.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
            theme.dispatchEvent(themeKey);
            expect(themeKey.defaultPrevented).toBe(false);
            expect(f.query.getAttribute('aria-label')).toBeTruthy();
        } finally { await f.window.happyDOM.close(); }
    });
});
