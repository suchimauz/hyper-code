import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';

const source = await Bun.file(new URL('./$script_canvas.js', import.meta.url)).text();
function setup(mobile = true) {
    const w = new Window({ url: 'http://localhost/agent/test' });
    const media = { matches: mobile, addEventListener(_name: string, fn: Function) { this.change = fn; }, change: (_e?: any) => {} };
    Object.defineProperty(w, 'matchMedia', { value: () => media });
    const requests: any[] = [];
    let subscriber: any;
    (w as any).hyperLive = { subscribe(s: any) { subscriber = s; } };
    (w as any).fetch = async (url: string, opts: any) => { requests.push({ url, body: opts?.body && JSON.parse(opts.body) }); return { ok: false }; };
    w.document.body.innerHTML = `<aside><button id="nav">Nav</button></aside><main data-page="agent" data-canvas-agent="test"><section data-canvas-panel><header><button class="canvas-mobile-back" data-canvas-toggle="close">В чат</button><select data-canvas-mobile-tabs><option value="1">One</option><option value="2">Two</option></select></header><div data-canvas-body><iframe src="about:blank"></iframe></div></section><div data-canvas-resizer tabindex="0"></div><div id="chat-panel"><button id="opener" data-canvas-toggle="open">Open</button><textarea id="draft">draft kept</textarea><div id="messages"></div></div></main>`;
    w.eval(source);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    return { w, media, requests, subscriber, root: w.document.querySelector('main')!, panel: w.document.querySelector('[data-canvas-panel]')! };
}

test('mobile Canvas stays mounted, preserves draft and scroll, inerts background and restores focus', async () => {
    const { w, root, panel, requests } = setup();
    const opener = w.document.getElementById('opener')!;
    const frame = panel.querySelector('iframe');
    const draft = w.document.getElementById('draft');
    const messages = w.document.getElementById('messages')!;
    messages.scrollTop = 123;
    opener.focus(); opener.click();
    expect(root.hasAttribute('data-canvas-open')).toBe(true);
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(w.document.getElementById('chat-panel')!.inert).toBe(true);
    expect(w.document.querySelector('aside')!.inert).toBe(true);
    expect(w.document.activeElement).toBe(panel.querySelector('.canvas-mobile-back'));
    messages.scrollTop = 999; // streaming while covered must not change the return position
    (panel.querySelector('.canvas-mobile-back') as any).click();
    expect(root.hasAttribute('data-canvas-open')).toBe(false);
    expect(panel.querySelector('iframe')).toBe(frame);
    expect(w.document.getElementById('draft')).toBe(draft);
    expect((draft as any).value).toBe('draft kept');
    expect(messages.scrollTop).toBe(123);
    expect(w.document.getElementById('chat-panel')!.inert).toBe(false);
    expect(w.document.activeElement).toBe(opener);
    expect(requests.map(r => r.body)).toEqual([{ open: true }, { open: false }]);
    await w.happyDOM.close();
});

test('server open, native tabs, Escape and breakpoint transitions leave width preference alone', async () => {
    const { w, root, panel, requests, subscriber, media } = setup();
    subscriber.onEvent({ agentId: 'test', open: true, chatWidth: 560 });
    expect(panel.getAttribute('aria-modal')).toBe('true');
    const select = panel.querySelector('select')!;
    select.value = '2'; select.dispatchEvent(new w.Event('change', { bubbles: true }));
    expect(requests.some(r => r.body?.activeItemId === 2)).toBe(true);
    media.matches = false; media.change();
    expect(panel.hasAttribute('aria-modal')).toBe(false);
    expect(w.document.getElementById('chat-panel')!.inert).toBe(false);
    expect(root.style.getPropertyValue('--chat-w')).toBe('560px');
    media.matches = true; media.change();
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.hasAttribute('data-canvas-open')).toBe(false);
    expect(requests.some(r => r.body?.chatWidth)).toBe(false);
    await w.happyDOM.close();
});

test('navigation removes modal inert state and leaves desktop unmodified', async () => {
    const { w, root, subscriber } = setup();
    subscriber.onEvent({ agentId: 'test', open: true });
    root.remove();
    await w.happyDOM.waitUntilComplete();
    expect(w.document.querySelector('aside')!.inert).toBe(false);
    await w.happyDOM.close();
    const desktop = setup(false);
    desktop.subscriber.onEvent({ agentId: 'test', open: true });
    expect(desktop.panel.hasAttribute('role')).toBe(false);
    expect(desktop.w.document.getElementById('chat-panel')!.inert).toBe(false);
    await desktop.w.happyDOM.close();
});

test('header refresh keeps iframe node, native dialog focus wins over Canvas', async () => {
    const { w, panel, subscriber } = setup();
    panel.setAttribute('data-canvas-rev', 'old');
    panel.querySelector('[data-canvas-body]')!.setAttribute('data-canvas-body-rev', 'body');
    const iframe = panel.querySelector('iframe');
    (w as any).fetch = async () => ({ ok: true, text: async () => '<section data-canvas-panel data-canvas-rev="new"><header><button class="canvas-mobile-back" data-canvas-toggle="close">В чат</button></header><div data-canvas-body data-canvas-body-rev="body"><iframe></iframe></div></section>' });
    subscriber.onEvent({ agentId: 'test', open: true, rev: 'new' });
    await w.happyDOM.waitUntilComplete();
    expect(panel.querySelector('iframe')).toBe(iframe);
    const dialog = w.document.createElement('dialog');
    dialog.innerHTML = '<button>Confirm</button>';
    w.document.body.append(dialog); dialog.showModal();
    dialog.querySelector('button')!.focus();
    await w.happyDOM.waitUntilComplete();
    expect(dialog.inert).toBe(false);
    expect(w.document.activeElement).toBe(dialog.querySelector('button'));
    await w.happyDOM.close();
});
