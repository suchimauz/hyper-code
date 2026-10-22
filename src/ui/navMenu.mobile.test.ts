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

test('touch menu resets on each opening without auto-scroll after async selection or redraw', async () => {
    const f = setup();
    try {
        f.window.history.replaceState({}, '', '/agent/ab');
        f.window.document.body.insertAdjacentHTML('afterbegin', '<div id="main"><div id="chat-panel" data-agent-id="ab"></div></div>');
        let resolveFetch!: (response: any) => void;
        f.window.fetch = (() => new Promise(resolve => { resolveFetch = resolve; })) as any;
        const results = f.window.document.getElementById('nav-results')!;
        results.innerHTML = '<a class="nav-row" data-nav-id="first">First</a><a class="nav-row" data-nav-id="project:p">Current project</a>';
        let reveals = 0;
        f.window.HTMLElement.prototype.scrollIntoView = () => { reveals++; results.scrollTop = 700; };
        results.scrollTop = 500;
        f.client.__navOpen();
        expect(results.scrollTop).toBe(0);
        resolveFetch({ ok: true, json: async () => ({ tabs: '<div class="project-tabs" data-project-id="p"></div>' }) });
        for (let i=0;i<10;i++) await Promise.resolve();
        expect(results.querySelector('[data-nav-id="project:p"]')?.getAttribute('aria-selected')).toBe('true');
        expect(results.scrollTop).toBe(0);
        expect(reveals).toBe(0);
        results.scrollTop = 120;
        f.window.document.body.dispatchEvent(new f.window.CustomEvent('htmx:afterSwap', { detail: { target: results } }));
        expect(results.scrollTop).toBe(120);
        expect(reveals).toBe(0);
        f.window.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'ArrowDown' }));
        expect(reveals).toBe(1);
        f.client.__navClose(); f.client.__navOpen();
        expect(results.scrollTop).toBe(0);
    } finally { await f.window.happyDOM.close(); }
});

test('desktop automatic selection still reveals the default row', async () => {
    const f = setup({ touch: false, width: 1280 });
    try {
        f.window.document.getElementById('nav-results')!.innerHTML = '<a class="nav-row" data-nav-default>Default</a>';
        let reveals=0; f.window.HTMLElement.prototype.scrollIntoView=()=>{reveals++;};
        f.client.__navOpen(); expect(reveals).toBe(1);
    } finally { await f.window.happyDOM.close(); }
});

test('menu quota strip sits below search, shares chat-strip data and returns to the open menu',async()=>{
 const f=setup();const w=f.window,d=w.document;
 try{
  const strip=d.querySelector('[data-nav-mobile-usage]')!;
  expect(d.getElementById('nav-q')!.closest('div')!.nextElementSibling).toBe(strip);
  expect(strip.nextElementSibling?.id).toBe('nav-results');
  const chat=d.createElement('button');chat.setAttribute('data-mobile-usage-open','');chat.innerHTML='<span data-mobile-usage-items></span><span data-mobile-usage-count></span>';d.body.append(chat);
  let reads=0;w.setInterval=(()=>0) as any;
  w.fetch=(async()=>{reads++;return {ok:true,json:async()=>({entries:[{provider:'codex',account:'default',label:'Codex',usedPercent:25,updatedAt:Date.now(),resetsAt:Date.now()+3600000,parkedAgents:0,models:[]}],gateway:null})};}) as any;
  const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
  w.eval(await Bun.file(new URL('./$script_mobileUsage.js',import.meta.url)).text());await tick();
  f.client.__navOpen();await tick();
  expect(reads).toBe(1);
  expect(strip.querySelectorAll('[data-usage-chip]')).toHaveLength(1);expect(chat.querySelectorAll('[data-usage-chip]')).toHaveLength(1);
  (strip as any).focus();strip.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  (strip as any).click();await tick();
  expect(d.querySelector('.mobile-usage-dialog')).not.toBeNull();
  expect(f.client.__navIsOpen()).toBe(true);
  const back=d.querySelector('[data-usage-back]')!;
  back.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  expect(f.client.__navIsOpen()).toBe(true);
  (back as any).click();
  expect(d.querySelector('.mobile-usage-dialog')).toBeNull();expect(d.activeElement).toBe(strip);expect(f.client.__navIsOpen()).toBe(true);
 }finally{await w.happyDOM.close();}
});
