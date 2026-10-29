import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';

const source = await Bun.file(new URL('./$script_navigationPreload.js', import.meta.url)).text();

function fixture(options: { saveData?: boolean; effectiveType?: string; online?: boolean; hidden?: boolean; reducedMotion?: boolean } = {}) {
    const w = new Window({ url: 'https://local/agent/start' });
    const d = w.document;
    d.body.innerHTML = '<nav><a id="next" href="/agent/next" hx-get="/agent/next" hx-target="#main">Next</a></nav><main id="main"><form id="draft"><textarea>Saved</textarea><button>Send</button></form><aside inert>Already inert</aside></main>';
    const main = d.getElementById('main')!;
    const form = d.getElementById('draft')!;
    const input = d.querySelector('textarea')!;
    input.value = 'Unsaved draft';
    Object.defineProperty(w.navigator, 'connection', { value: { saveData: options.saveData ?? false, effectiveType: options.effectiveType ?? '4g' }, configurable: true });
    Object.defineProperty(w.navigator, 'onLine', { value: options.online ?? true, configurable: true });
    Object.defineProperty(d, 'hidden', { get: () => options.hidden ?? false, configurable: true });
    Object.defineProperty(d, 'visibilityState', { get: () => options.hidden ? 'hidden' : 'visible', configurable: true });
    const calls: { url: string; init: any }[] = [];
    let fetcher = async (_url: string, _init: any): Promise<Response> => new Response('<p>Prefetched</p>', { headers: { 'Content-Type': 'text/html' } });
    w.fetch = (async (url: any, init: any) => { calls.push({ url: String(url), init }); return fetcher(String(url), init); }) as any;
    let live: any;
    let subscriptions = 0;
    (w as any).hyperLive = { subscribe(callback: any) { subscriptions++; live = callback; return () => {}; } };
    // No idle work or real timers/network: every request is explicitly driven below.
    (w as any).requestIdleCallback = () => 1;
    let now = 1_000_000;
    w.Date.now = () => now;
    if (options.reducedMotion) w.matchMedia = (() => ({ matches: true })) as any;
    w.eval(source);
    const nav = (w as any).hyperNavigation;
    const event = (name: string, ctx: any, target: any = main) => {
        const e = new w.CustomEvent(name, { bubbles: true, cancelable: true, detail: { ctx } });
        target.dispatchEvent(e);
        return e;
    };
    const request = (url: string, method = 'GET') => {
        let aborted = 0;
        const ctx: any = { target: main, source: d.getElementById('next'), request: { action: url, method, headers: { 'HX-Request': 'true', 'HX-Target': 'main', 'HX-Request-Type': 'partial' }, abort: () => { aborted++; } }, fetch: w.fetch.bind(w) };
        event('htmx:before:request', ctx);
        return { ctx, aborted: () => aborted, fetch: () => ctx.fetch(ctx.request.action, ctx.request) as Promise<Response> };
    };
    return { w, d, main, form, input, nav, calls, event, request, setFetcher(fn: typeof fetcher) { fetcher = fn; }, advance(ms: number) { now += ms; }, emitLive(value: any) { if (value.type === 'gap') live?.resync(); else live?.onEvent(value); }, subscriptions: () => subscriptions, close: () => w.happyDOM.close() };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}

test('prepare immediately preserves draft DOM, blocks old controls and cancel/failure restores interactivity', async () => {
    const f = fixture();
    try {
        const ticket = f.nav.prepare('/agent/next', 'Next');
        expect(ticket.id).toBeDefined();
        expect(ticket.url).toContain('/agent/next');
        expect(f.nav.isCurrent(ticket)).toBe(true);
        expect(f.d.querySelector('[data-navigation-loading]')).not.toBeNull();
        expect(f.main.getAttribute('aria-busy')).toBe('true');
        expect(f.form.parentElement).toBe(f.main);
        expect(f.form.hasAttribute('inert')).toBe(true);
        expect(f.input.value).toBe('Unsaved draft');
        f.nav.cancel();
        expect(f.d.querySelector('[data-navigation-loading]')).toBeNull();
        expect(f.main.getAttribute('aria-busy')).not.toBe('true');
        expect(f.form.hasAttribute('inert')).toBe(false);
        expect(f.d.querySelector('aside')!.hasAttribute('inert')).toBe(true);
        f.nav.prepare('/agent/next');
        const req = f.request('/agent/next');
        f.event('htmx:finally:request', req.ctx);
        expect(f.d.querySelector('[data-navigation-loading]')).toBeNull();
        expect(f.form.hasAttribute('inert')).toBe(false);
        f.input.focus();
        expect(f.d.activeElement).toBe(f.input);
        expect(f.input.value).toBe('Unsaved draft');
    } finally { await f.close(); }
});

test('prefetched response is consumed once by htmx, then native fetch resumes', async () => {
    const f = fixture();
    try {
        expect(await f.nav.preload('/llms')).not.toBeNull();
        expect(f.calls).toHaveLength(1);
        const first = f.request('/llms');
        expect(await (await first.fetch()).text()).toBe('<p>Prefetched</p>');
        expect(f.calls).toHaveLength(1);
        f.event('htmx:after:swap', first.ctx);
        expect(f.d.querySelector('[data-navigation-loading]')).toBeNull();
        await f.request('/llms').fetch();
        expect(f.calls).toHaveLength(2);
    } finally { await f.close(); }
});

test('cached agent navigation records a visit only after the actual swap', async () => {
    const f = fixture();
    try {
        await f.nav.preload('/agent/next');
        const req = f.request('/agent/next');
        await req.fetch();
        expect(f.calls).toHaveLength(1);
        f.event('htmx:after:swap', req.ctx);
        expect(f.calls).toHaveLength(2);
        expect(f.calls[0]!.init.headers['X-Hyper-Prefetch']).toBe('1');
        expect(f.calls[1]!.init.headers['X-Hyper-Prefetch']).toBeUndefined();
        expect(f.input.value).toBe('Unsaved draft');
    } finally { await f.close(); }
});

test('HTTP errors prevent swap, restore the draft and expose a retry without replacing the form', async () => {
    const f = fixture();
    try {
        f.input.focus();
        const req = f.request('/agent/failure');
        req.ctx.response = { raw: new Response('Failed', { status: 503 }), status: 503 };
        expect(f.event('htmx:before:response', req.ctx).defaultPrevented).toBe(true);
        expect(f.d.querySelector('[data-navigation-loading]')).toBeNull();
        expect(f.form.hasAttribute('inert')).toBe(false);
        expect(f.input.value).toBe('Unsaved draft');
        expect(f.d.activeElement).toBe(f.input);
        expect(f.main.querySelector('[role="alert"] a')?.getAttribute('href')).toBe('/agent/failure');
    } finally { await f.close(); }
});

test('expired and failed prefetches fall back to native fetch', async () => {
    const f = fixture();
    try {
        await f.nav.preload('/agent/next');
        f.advance(5001);
        await f.request('/agent/next').fetch();
        expect(f.calls).toHaveLength(2);
        f.nav.invalidate();
        f.setFetcher(async () => { throw new Error('offline fixture'); });
        expect(await f.nav.preload('/agent/failure')).toBeNull();
        f.setFetcher(async () => new Response('Recovered', { headers: { 'Content-Type': 'text/html' } }));
        expect(await (await f.request('/agent/failure').fetch()).text()).toBe('Recovered');
    } finally { await f.close(); }
});

test('allowlist never prefetches foreign origins, mutations, subresources or unsupported routes', async () => {
    const f = fixture();
    try {
        for (const url of ['https://evil.test/agent/a', '//evil.test/llms', 'javascript:alert(1)', 'https://user:password@local/agent/a', '/agent/a#anchor', '/agent/a?delete=1', '/llms?unexpected=1', '/projects/view?projectId=', '/agent/new', '/agent/a/messages', '/agent/a/delete', '/projects/view', '/settings', '/api/agents', '/llms/delete']) {
            expect((await f.nav.preload(url)) === null).toBe(true);
        }
        expect(f.calls).toHaveLength(0);
        for (const url of ['/agent/a', '/projects/view?projectId=p1', '/projects/archive', '/llms', '/llms?provider=anthropic']) {
            expect(await f.nav.preload(url)).not.toBeNull();
        }
        expect(f.calls).toHaveLength(5);
        expect(f.calls.every(call => !call.init?.method || call.init.method.toUpperCase() === 'GET')).toBe(true);
    } finally { await f.close(); }
});

test('non-HTML, full documents, live input forms and unsafe redirects never enter the cache', async () => {
    const f = fixture();
    try {
        const responses = [
            new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
            new Response('<html><body>Login</body></html>', { headers: { 'Content-Type': 'text/html' } }),
            new Response('<section data-input-state="open">Approval</section>', { headers: { 'Content-Type': 'text/html' } }),
            new Response('', { headers: { 'HX-Location': 'https://evil.test/agent/a' } }),
            new Response('', { headers: { 'HX-Redirect': '/login' } }),
            new Response('error', { status: 500, headers: { 'Content-Type': 'text/html' } }),
        ];
        for (const response of responses) {
            f.setFetcher(async () => response);
            expect((await f.nav.preload('/agent/next')) === null).toBe(true);
        }
        f.setFetcher(async () => new Response('fresh'));
        expect(await (await f.request('/agent/next').fetch()).text()).toBe('fresh');
        expect(f.calls).toHaveLength(responses.length + 1);
    } finally { await f.close(); }
});

test('latest navigation aborts previous request and prevents stale response and stale finalizer', async () => {
    const f = fixture();
    try {
        const old = f.nav.prepare('/agent/old');
        const first = f.request('/agent/old');
        const latest = f.nav.prepare('/agent/next');
        expect(first.aborted()).toBe(1);
        expect(f.nav.isCurrent(old)).toBe(false);
        expect(f.nav.isCurrent(latest)).toBe(true);
        const second = f.request('/agent/next');
        expect(f.event('htmx:before:response', first.ctx).defaultPrevented).toBe(true);
        f.event('htmx:finally:request', first.ctx);
        expect(f.d.querySelector('[data-navigation-loading]')).not.toBeNull();
        expect(f.event('htmx:before:response', second.ctx).defaultPrevented).toBe(false);
        f.event('htmx:after:swap', second.ctx);
        expect(f.d.querySelector('[data-navigation-loading]')).toBeNull();
    } finally { await f.close(); }
});

test('non-GET requests and live events/gaps invalidate cached responses', async () => {
    const f = fixture();
    try {
        for (const invalidate of [() => f.request('/api/change', 'POST'), () => f.emitLive({ type: 'events', events: [{ topic: 'agents' }] }), () => f.emitLive({ type: 'gap' }), () => f.nav.invalidate()]) {
            await f.nav.preload('/agent/next');
            const count = f.calls.length;
            invalidate();
            await f.request('/agent/next').fetch();
            expect(f.calls.length).toBe(count + 1);
        }
    } finally { await f.close(); }
});

test('speculative requests respect reduced data, slow networks, offline and hidden documents', async () => {
    for (const options of [{ saveData: true }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }, { online: false }, { hidden: true }]) {
        const f = fixture(options);
        try { expect(await f.nav.preload('/agent/next')).toBeNull(); expect(f.calls).toHaveLength(0); }
        finally { await f.close(); }
    }
});

test('modified clicks, download and target links are untouched; plain clicks show immediate loading', async () => {
    const f = fixture();
    try {
        const link = f.d.getElementById('next')!;
        for (const patch of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
            const e = new f.w.MouseEvent('click', { bubbles: true, cancelable: true, ...patch });
            link.dispatchEvent(e);
            expect(e.defaultPrevented).toBe(false);
            expect(f.d.querySelector('[data-navigation-loading]')).toBeNull();
        }
        for (const [key, value] of [['target', '_blank'], ['download', 'page.html']]) {
            link.setAttribute(key!, value!);
            link.dispatchEvent(new f.w.MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(f.d.querySelector('[data-navigation-loading]')).toBeNull();
            link.removeAttribute(key!);
        }
        link.dispatchEvent(new f.w.MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(f.d.querySelector('[data-navigation-loading]')).not.toBeNull();
    } finally { await f.close(); }
});

test('installation is idempotent and focus/pointer intent reuses a single prefetch', async () => {
    const f = fixture();
    try {
        f.w.eval(source);
        expect((f.w as any).hyperNavigation).toBe(f.nav);
        expect(f.subscriptions()).toBe(1);
        const link = f.d.getElementById('next')!;
        link.dispatchEvent(new f.w.FocusEvent('focusin', { bubbles: true }));
        link.dispatchEvent(new f.w.MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        await f.nav.preload('/agent/next');
        expect(f.calls).toHaveLength(1);
    } finally { await f.close(); }
});

test('browser back invalidates the old ticket and blocks its late response', async () => {
    const f = fixture();
    try {
        const old = f.nav.prepare('/agent/next');
        const req = f.request('/agent/next');
        f.w.history.replaceState({}, '', '/agent/start');
        f.w.dispatchEvent(new f.w.PopStateEvent('popstate', { state: {} }));
        expect(f.nav.isCurrent(old)).toBe(false);
        expect(f.event('htmx:before:response', req.ctx).defaultPrevented).toBe(true);
    } finally { await f.close(); }
});

test('cache keeps at most six entries without persistent browser storage', async () => {
    const f = fixture();
    try {
        for (let i = 0; i < 7; i++) await f.nav.preload(`/agent/cache-${i}`);
        const before = f.calls.length;
        await f.request('/agent/cache-0').fetch();
        expect(f.calls.length).toBe(before + 1);
        expect(f.w.localStorage.length).toBe(0);
        expect(f.w.sessionStorage.length).toBe(0);
    } finally { await f.close(); }
});

test('invalidation during an in-flight prefetch cannot repopulate stale HTML', async () => {
    const f = fixture();
    try {
        const pending = deferred<Response>();
        f.setFetcher(() => pending.promise);
        const preload = f.nav.preload('/agent/next');
        await Promise.resolve();
        f.nav.invalidate();
        pending.resolve(new Response('stale', { headers: { 'Content-Type': 'text/html' } }));
        expect((await preload) === null).toBe(true);
        f.setFetcher(async () => new Response('fresh'));
        expect(await (await f.request('/agent/next').fetch()).text()).toBe('fresh');
        expect(f.calls).toHaveLength(2);
    } finally { await f.close(); }
});

test('at most two speculative requests run concurrently', async () => {
    const f = fixture();
    const pending: ReturnType<typeof deferred<Response>>[] = [];
    try {
        f.setFetcher(() => { const task = deferred<Response>(); pending.push(task); return task.promise; });
        const jobs = ['/agent/a', '/agent/b', '/agent/c'].map(url => f.nav.preload(url));
        await Promise.resolve();
        expect(pending.length).toBeLessThanOrEqual(2);
        // Support either bounded queuing or dropping excess speculative work.
        for (let round = 0; round < 8; round++) {
            pending.splice(0).forEach(task => task.resolve(new Response('ok', { headers: { 'Content-Type': 'text/html' } })));
            await Promise.resolve();
        }
        await Promise.all(jobs);
    } finally { pending.forEach(task => task.resolve(new Response('ok'))); await f.close(); }
});


test('loading veil keeps one centered layer through rapid switches and clips to visible main below tabs', async () => {
    const f = fixture();
    try {
        let rect = { left: 20, right: 420, top: 100, bottom: 700, height: 600 };
        f.main.getBoundingClientRect = (() => rect) as any;
        const tabs = f.d.createElement('div'); tabs.id = 'project-tabs-host';
        tabs.getBoundingClientRect = (() => ({ top: 100, bottom: 148, height: 48 })) as any;
        f.main.prepend(tabs);
        f.input.focus();
        const first = f.request('/agent/next');
        const overlay = f.d.querySelector('[data-navigation-loading]')! as any;
        expect(overlay.parentElement).toBe(f.d.body);
        expect(overlay.style.top).toBe('148px');
        expect(overlay.style.left).toBe('20px');
        expect(overlay.style.width).toBe('400px');
        expect(overlay.style.height).toBe('552px');
        expect(overlay.querySelector('.navigation-spinner[aria-hidden="true"]')).not.toBeNull();
        expect(overlay.querySelector('[role="status"]').textContent).toContain('Загрузка');
        expect(f.d.querySelector('.navigation-skeleton')).toBeNull();
        expect(tabs.hasAttribute('inert')).toBe(false);
        expect(f.d.activeElement).toBe(overlay.querySelector('button'));
        f.request('/llms');
        expect(first.aborted()).toBe(1);
        expect(f.d.querySelector('[data-navigation-loading]')).toBe(overlay);
        expect(f.d.querySelectorAll('.navigation-loading-layer')).toHaveLength(1);
        expect(overlay.querySelector('h2').textContent).toBe('Модели и лимиты');
        rect = { left: 10, right: 310, top: 40, bottom: 600, height: 560 };
        f.w.dispatchEvent(new f.w.Event('resize'));
        expect(overlay.style.width).toBe('300px');
        expect(overlay.style.height).toBe('452px');
        f.nav.cancel();
        expect(f.d.activeElement).toBe(f.input);
        expect(f.input.value).toBe('Unsaved draft');
        expect(overlay.hasAttribute('data-navigation-leaving')).toBe(true);
        expect(overlay.hasAttribute('inert')).toBe(true);
        expect(f.form.hasAttribute('inert')).toBe(false);
        f.nav.prepare('/agent/newer');
        expect(f.d.querySelector('[data-navigation-loading]')).toBe(overlay);
        expect(overlay.hasAttribute('inert')).toBe(false);
        expect(overlay.hasAttribute('data-navigation-leaving')).toBe(false);
    } finally { await f.close(); }
});

test('successful swap fades veil without delaying new page and moves focus out of removed controls', async () => {
    const f = fixture();
    try {
        f.input.focus();
        const req = f.request('/llms');
        const overlay = f.d.querySelector('[data-navigation-loading]')!;
        f.main.innerHTML = '<div id="project-tabs-host"></div><section><h1>Models</h1></section>';
        f.event('htmx:after:swap', req.ctx);
        expect(f.d.querySelector('[data-navigation-loading]')).toBeNull();
        expect(overlay.isConnected).toBe(true);
        expect(overlay.getAttribute('aria-hidden')).toBe('true');
        expect(f.main.querySelector('section')!.hasAttribute('data-navigation-entering')).toBe(true);
        expect(f.main.querySelector('#project-tabs-host')!.hasAttribute('data-navigation-entering')).toBe(false);
        expect(f.d.activeElement).toBe(f.main.querySelector('h1'));
        expect(f.main.getAttribute('aria-busy')).toBeNull();
        await new Promise(resolve => setTimeout(resolve, 230));
        expect(overlay.isConnected).toBe(false);
        expect(f.main.querySelector('[data-navigation-entering]')).toBeNull();
    } finally { await f.close(); }
});

test('reduced motion removes veil immediately and skips page entry animation', async () => {
    const f = fixture({ reducedMotion: true });
    try {
        const req = f.request('/llms');
        const overlay = f.d.querySelector('[data-navigation-loading]')!;
        f.main.innerHTML = '<section><h1>Models</h1></section>';
        f.event('htmx:after:swap', req.ctx);
        expect(overlay.isConnected).toBe(false);
        expect(f.main.querySelector('[data-navigation-entering]')).toBeNull();
    } finally { await f.close(); }
});

test('cancel does not steal focus when another navigation control is already focused', async () => {
    const f = fixture();
    try {
        f.input.focus(); f.nav.prepare('/llms');
        const link = f.d.getElementById('next')!;
        link.focus(); f.nav.cancel();
        expect(f.d.activeElement).toBe(link);
        expect(f.form.hasAttribute('inert')).toBe(false);
    } finally { await f.close(); }
});
