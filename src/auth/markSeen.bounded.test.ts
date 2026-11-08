import { expect, test } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';
import { reqCtx } from '../$test';
import readReceipt from '../api/$route_v1_agents_$id_read_POST';

for (const identified of [false, true]) test(`bounded receipts preserve newer unread events and monotonic state (user=${identified})`, async () => {
    const ctx = await mkTestCtx();
    const r: any = reqCtx(ctx);
    if (identified) r.session.user = await ctx.fns.auth.createUser({ name: 'Reader', password: 'password-123' });
    const a = await r.fns.agent.start({ model: 'mock:echo' });
    await r.fns.session.save({ agent: a });
    expect(await r.fns.auth.markSeen({ agentId: a.id, throughTs: 100 })).toBe(0);
    await ctx.fns.session.appendEvent({ id: a.id, event: { type: 'assistant', text: 'loaded' } });
    await ctx.fns.procs.db.run({ sql: 'UPDATE events SET ts = 100 WHERE agent_id = ?', params: [a.id] });
    // A newer reply arrives after the client loaded the first event.
    await ctx.fns.session.appendEvent({ id: a.id, event: { type: 'assistant', text: 'not loaded' } });
    await ctx.fns.procs.db.run({ sql: 'UPDATE events SET ts = 200 WHERE agent_id = ? AND ts > 100', params: [a.id] });
    expect(await r.fns.auth.markSeen({ agentId: a.id, throughTs: 100 })).toBe(100);
    const unread = (await r.fns.session.list({})).find((item: any) => item.id === a.id).unread;
    expect(unread).toBeGreaterThan(0);
    expect(await r.fns.auth.markSeen({ agentId: a.id, throughTs: 50 })).toBe(100);
    expect(await r.fns.auth.markSeen({ agentId: a.id, throughTs: 999 })).toBe(200);
    expect(await r.fns.auth.markSeen({ agentId: a.id })).toBe(200);
    expect(await r.fns.auth.markSeen({ agentId: a.id, throughTs: 100 })).toBe(200);
    for (const throughTs of [-1, NaN, Infinity]) {
        await expect(r.fns.auth.markSeen({ agentId: a.id, throughTs })).rejects.toThrow();
    }
    const kv = await ctx.fns.procs.db.select({ sql: 'SELECT value FROM kv WHERE key = ?', params: [`seen-at:${a.id}`] });
    expect(Number(kv[0].value)).toBe(200);
});

test('mobile read route supports optional bounded JSON, legacy empty bodies, validation and missing agents', async () => {
    const ctx = await mkTestCtx();
    const a = await ctx.fns.agent.start({ model: 'mock:echo' }); await ctx.fns.session.save({ agent: a });
    await ctx.fns.session.appendEvent({ id: a.id, event: { type: 'assistant', text: 'reply' } });
    await ctx.fns.procs.db.run({ sql: 'UPDATE events SET ts = 200 WHERE agent_id = ?', params: [a.id] });
    const call = (body: string, id = a.id) => readReceipt(ctx, null, { req: new Request('http://localhost/read', { method: 'POST', body }), params: { id } });
    expect((await (await call('{"throughTs":100}')).json()).seenAt).toBe(100);
    for (const body of ['{', '{}', 'null', '[]', '{"throughTs":"100"}', '{"throughTs":-1}', '{"throughTs":1e999}']) {
        expect((await call(body)).status).toBe(400);
    }
    expect((await (await call('')).json()).seenAt).toBe(200);
    expect((await call('', 'missing-agent')).status).toBe(404);
});
