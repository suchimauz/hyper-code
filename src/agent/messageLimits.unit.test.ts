import { test, expect } from 'bun:test';
import message from './message';
import setLimits from './setMessageLimits';
import route from './$route_$id_message-limits_POST';

function fixture(enabled?: boolean, hop = 50, count = 30) {
    let counts = 0;
    const agent: any = { id: 'a', scratchpad: {} };
    const stored: any = { messageLimitsEnabled: enabled, preserved: 'yes' };
    const ctx: any = { state: { agent: { a: agent } }, fns: {
        procs: { db: { select: async ({ sql }: any) => {
            if (sql.includes('FROM agents')) return [{ id: 'a', scratchpad: stored }, { id: 'b', visibility: 'nav' }];
            if (sql.includes('COUNT')) { counts++; return [{ n: count }]; }
            return [{ message_type: 'agent_message', content: `<agent-message hop="${hop}">` }];
        } } },
        auth: { getUser: async () => null },
        agent: { renderEventHtml: async () => '', setMessageLimits: async (opts: any) => setLimits(ctx, null, opts) },
        events: { refreshAgentMeta: () => {} },
        session: { deliverInbound: async () => ({ queued: false, messageIdx: 1 }), mutateScratchpad: async ({ mutate }: any) => { mutate(stored); return { scratchpad: { ...stored } }; } },
    } };
    return { ctx, agent, stored, counts: () => counts, send: () => message(ctx, null, { agent, to: 'b', text: 'test', wake: false }) };
}
test('default and enabled hop limit remain enforced', async () => {
    for (const enabled of [undefined, true]) await expect(fixture(enabled).send()).rejects.toThrow('hop limit');
});
test('enabled rate limit remains enforced', async () => {
    await expect(fixture(true, 1).send()).rejects.toThrow('rate limit');
});
test('durable sender opt-out bypasses both limits even with stale live scratchpad', async () => {
    const f = fixture(false);
    expect(await f.send()).toMatchObject({ delivered: true, hop: 51 });
    expect(f.counts()).toBe(0);
});
test('durable JSON text scratchpad supports opt-out', async () => {
    const f = fixture(false);
    const select = f.ctx.fns.procs.db.select;
    f.ctx.fns.procs.db.select = async (opts: any) => {
        const rows = await select(opts);
        return opts.sql.includes('FROM agents') ? rows.map((r: any) => r.id === 'a' ? { ...r, scratchpad: JSON.stringify(r.scratchpad) } : r) : rows;
    };
    await expect(f.send()).resolves.toMatchObject({ hop: 51 });
});
test('only explicit false disables limits', async () => {
    const f = fixture(); f.stored.messageLimitsEnabled = 'false';
    await expect(f.send()).rejects.toThrow('hop limit');
});
test('setter preserves other scratchpad fields and toggle can re-enable limits', async () => {
    const f = fixture();
    expect(await setLimits(f.ctx, null, { id: 'a', enabled: false })).toEqual({ enabled: false });
    expect(f.agent.scratchpad).toEqual({ messageLimitsEnabled: false, preserved: 'yes' });
    await expect(f.send()).resolves.toMatchObject({ hop: 51 });
    await setLimits(f.ctx, null, { id: 'a', enabled: true });
    await expect(f.send()).rejects.toThrow('hop limit');
});
test('settings route persists checked and unchecked values', async () => {
    const f = fixture();
    for (const enabled of [false, true]) {
        const req = new Request('http://localhost/agent/a/message-limits', { method: 'POST', body: new URLSearchParams(enabled ? { enabled: '1' } : {}) });
        expect((await route(f.ctx, null, { req, params: { id: 'a' } })).status).toBe(204);
        expect(f.stored.messageLimitsEnabled).toBe(enabled);
    }
});
