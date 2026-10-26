import { afterEach, expect, test } from 'bun:test';
import sweepIdle from './sweepIdle';
import ensureIdleReaper from './ensureIdleReaper';
import session from './session';
import send from './send';

const originalFetch = globalThis.fetch;
const originalWS = globalThis.WebSocket;
afterEach(() => { globalThis.fetch = originalFetch; globalThis.WebSocket = originalWS; });
function handle(extra: Record<string, unknown> = {}) {
    return { targetId: 'owned-tab', owned: true, lastUsed: Date.now() - 601_000, pending: new Map(), ws: { close() {} }, ...extra };
}
function context(entries: Array<[string, any]>) {
    const ctx: any = { state: { cdp: { sessions: new Map(entries) } }, fns: { cdp: {}, procs: { env: { cdpUrl: () => 'http://fixture.invalid:9222' } } } };
    ctx.fns.cdp.scope = async (o: any) => ({ session: o.session, targetId: o.targetId, bound: false });
    ctx.fns.cdp.ensureIdleReaper = async () => ({ started: false });
    return ctx;
}
test('expires owned targets once and retains a closed identity marker', async () => {
    const h = handle(); const ctx = context([['job', h], ['alias', handle()]]);
    const urls: string[] = [];
    globalThis.fetch = (async (url: any) => { urls.push(String(url)); return new Response('Target is closing'); }) as any;
    expect(await sweepIdle(ctx, null, {})).toEqual({ closed: ['owned-tab'], failed: [] });
    expect(h.closed).toBe(true);
    expect(h.closing).toBe(false);
    await sweepIdle(ctx, null, {});
    expect(urls).toEqual(['http://fixture.invalid:9222/json/close/owned-tab']);
    await expect(session(ctx, null, { name: 'job' })).rejects.toThrow('was closed');
});
for (const [label, extra] of Object.entries({ recent: { lastUsed: Date.now() }, external: { owned: false }, unknown: { owned: undefined }, pending: { pending: new Map([[1, {}]]) }, noTimestamp: { lastUsed: undefined } })) {
    test('protects ' + label, async () => {
        globalThis.fetch = (async () => { throw new Error('must not fetch'); }) as any;
        expect(await sweepIdle(context([['job', handle(extra)]]), null, {})).toEqual({ closed: [], failed: [] });
    });
}
test('active aliases and live viewers protect the entire target', async () => {
    const h = handle(); const ctx = context([['job', h], ['alias', handle({ owned: false, lastUsed: Date.now() })]]);
    expect((await sweepIdle(ctx, null, {})).closed).toEqual([]);
    ctx.state.cdp.sessions.delete('alias');
    ctx.state.browser = { live: new Set([{ conn: { targetId: () => 'owned-tab' } }]) };
    expect((await sweepIdle(ctx, null, {})).closed).toEqual([]);
    expect(Date.now() - h.lastUsed).toBeLessThan(1000);
});
test('a close in flight blocks overlapping sweep and new commands', async () => {
    const h = handle(); const ctx = context([['job', h]]);
    let release!: (r: Response) => void;
    globalThis.fetch = (() => new Promise<Response>(resolve => { release = resolve; })) as any;
    const first = sweepIdle(ctx, null, {});
    expect(h.closing).toBe(true);
    expect(await sweepIdle(ctx, null, {})).toEqual({ closed: [], failed: [] });
    await expect(session(ctx, null, { name: 'job' })).rejects.toThrow('being closed');
    await expect(session(ctx, null, { name: 'alias', targetId: 'owned-tab' })).rejects.toThrow('being closed');
    release(new Response('ok'));
    await first;
});
test('failed closes remain retryable and missing targets are cleaned', async () => {
    const h = handle(); const ctx = context([['job', h]]);
    globalThis.fetch = (async () => new Response('unavailable', { status: 503 })) as any;
    expect((await sweepIdle(ctx, null, {})).failed).toEqual(['owned-tab']);
    expect(h.closed).toBeUndefined(); expect(h.closing).toBe(false);
    globalThis.fetch = (async () => new Response('missing', { status: 404 })) as any;
    expect((await sweepIdle(ctx, null, {})).closed).toEqual(['owned-tab']);
});
test('timer is single per runtime and calls the current sweep', async () => {
    const ctx = context([]);
    expect(await ensureIdleReaper(ctx, null, {})).toEqual({ started: true });
    const timer = ctx.state.cdp.idleTimer;
    try {
        expect(await ensureIdleReaper(ctx, null, {})).toEqual({ started: false });
        expect(ctx.state.cdp.idleTimer).toBe(timer);
        expect(timer.hasRef()).toBe(false);
    } finally { clearInterval(timer); }
});
test('command completion starts a fresh idle window even on failure', async () => {
    const h = { ...handle(), msgId: 0, ws: { send() { throw new Error('send failed'); } } };
    const ctx = context([['job', h]]); ctx.fns.cdp.session = async () => h;
    await expect(send(ctx, null, { method: 'Runtime.evaluate', session: 'job' })).rejects.toThrow('send failed');
    expect(Date.now() - h.lastUsed).toBeLessThan(1000);
    expect(h.pending.size).toBe(0);
});
test('new targets are owned, explicit targets are not, and reconnect retains ownership', async () => {
    let created = 0;
    class WS {
        static OPEN = 1; readyState = 1; onopen: any; onmessage: any; onerror: any; onclose: any;
        constructor(_url: string) { queueMicrotask(() => this.onopen?.()); }
        send(text: string) { const msg = JSON.parse(text); created++; queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id: msg.id, result: { targetId: 'created-' + created } }) })); }
        close() { this.readyState = 3; this.onclose?.(); }
    }
    globalThis.WebSocket = WS as any;
    globalThis.fetch = (async () => Response.json({ webSocketDebuggerUrl: 'ws://fixture.invalid/browser' })) as any;
    const ctx = context([]);
    const own = await session(ctx, null, { name: 'job' });
    expect(own.owned).toBe(true); expect(created).toBe(1);
    own.ws.close();
    const restored = await session(ctx, null, { name: 'job' });
    expect(restored.owned).toBe(true); expect(restored.targetId).toBe(own.targetId); expect(created).toBe(1);
    const external = await session(ctx, null, { name: 'user', targetId: 'existing-user-tab' });
    expect(external.owned).toBe(false); expect(created).toBe(1);
});
