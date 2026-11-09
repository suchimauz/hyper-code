import { test, expect } from 'bun:test';
import route from './$route_codex_reset_POST';

function fixture() {
    const calls: object[] = [];
    const events: object[] = [];
    const ctx: any = { fns: {
        auth: { currentUser: async () => ({ required: true, user: { role: 'owner' } }), verifyCsrf: async () => true },
        http: { publicOrigin: async () => 'https://hyper.test' },
        llm: { consumeResetCredit: async (opts: object) => { calls.push(opts); return { outcome: 'reset', windowsReset: 2 }; } },
        procs: { events: { refresh: (opts: object) => events.push(opts) } },
    } };
    const data = { account: 'default', creditId: 'credit', confirmed: true, idempotencyKey: 'stable-retry-key-123' };
    const run = (body: unknown = data, headers: Record<string, string> = {}) => route(ctx, null, { req: new Request('https://hyper.test/llms/codex/reset', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hyper.test', 'x-csrf-token': 'token', ...headers }, body: JSON.stringify(body) }) });
    return { ctx, calls, events, data, run };
}
test('confirmed reset returns JSON and preserves the caller retry key', async () => {
    const f = fixture();
    const response = await f.run();
    expect(await response.json()).toEqual({ outcome: 'reset', windowsReset: 2 });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(f.calls).toEqual([{ account: 'default', creditId: 'credit', idempotencyKey: f.data.idempotencyKey }]);
    expect(f.events).toHaveLength(2);
});
test('reset rejects unauthenticated, non-owner, CSRF and cross-origin requests without redeeming', async () => {
    for (const failure of ['anonymous', 'member', 'csrf', 'origin']) {
        const f = fixture();
        if (failure === 'anonymous') f.ctx.fns.auth.currentUser = async () => ({ required: true, user: null });
        if (failure === 'member') f.ctx.fns.auth.currentUser = async () => ({ required: true, user: { role: 'member' } });
        if (failure === 'csrf') f.ctx.fns.auth.verifyCsrf = async () => false;
        expect((await f.run(f.data, failure === 'origin' ? { origin: 'https://evil.test' } : {})).status).toBe(failure === 'anonymous' ? 401 : 403);
        expect(f.calls).toHaveLength(0);
    }
});
test('reset requires explicit confirmation, JSON and a stable key', async () => {
    const f = fixture();
    for (const body of [null, [], { ...f.data, confirmed: false }, { ...f.data, idempotencyKey: '' }, { ...f.data, creditId: {} }]) expect((await f.run(body)).status).toBe(400);
    expect((await f.run(f.data, { 'content-type': 'application/x-www-form-urlencoded' })).status).toBe(415);
    expect(f.calls).toHaveLength(0);
});
