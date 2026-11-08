import { expect, test } from 'bun:test';
import markSeen from './markSeen';
import readReceipt from '../api/$route_v1_agents_$id_read_POST';

function fixture(userId: string | null = 'reader') {
    const state = { max: 200 as number | null, seen: 0, kv: 0, mentions: 0 };
    const ctx: any = { fns: {
        auth: { viewerId: async () => userId, listUsers: async () => [{}], markSeen: (opts: any) => markSeen(ctx, null, opts) },
        mentions: { markRead: async () => { state.mentions++; } },
        procs: { db: {
            select: async ({ sql, params }: any) => sql.includes('MAX(ts)') ? [{ ts: params[0] === 'missing' ? null : state.max }] : [],
            run: async ({ sql, params }: any) => {
                if (sql.includes('user_agent_state')) {
                    expect(sql).toContain('GREATEST'); expect(sql).toContain('RETURNING seen_at');
                    state.seen = Math.max(state.seen, params[2]); return { rows: [{ seen_at: state.seen }] };
                }
                expect(sql).toContain('GREATEST'); expect(sql).toContain('RETURNING value');
                state.kv = Math.max(state.kv, Number(params[1])); return { rows: [{ value: String(state.kv) }] };
            },
        } },
    } };
    return { ctx, state };
}
for (const user of ['reader', null]) test(`bounded receipt clamp and monotonic return, isolated user=${user}`, async () => {
    const { ctx, state } = fixture(user);
    expect(await markSeen(ctx, null, { agentId: 'a', throughTs: 100 })).toBe(100);
    expect(state.kv).toBe(100); expect(state.mentions).toBe(0);
    expect(await markSeen(ctx, null, { agentId: 'a', throughTs: 50 })).toBe(100);
    expect(await markSeen(ctx, null, { agentId: 'a', throughTs: 999 })).toBe(200);
    expect(await markSeen(ctx, null, { agentId: 'a' })).toBe(200);
    expect(state.mentions).toBe(user ? 1 : 0);
    for (const throughTs of [-1, NaN, Infinity]) await expect(markSeen(ctx, null, { agentId: 'a', throughTs })).rejects.toThrow();
    state.max = null; state.seen = state.kv = 0;
    expect(await markSeen(ctx, null, { agentId: 'a', throughTs: 100 })).toBe(0);
});

test('read endpoint validates bounded bodies and preserves legacy empty-body response', async () => {
    const { ctx } = fixture();
    const call = (body: string, id = 'a') => readReceipt(ctx, null, { req: new Request('http://localhost/read', { method: 'POST', body }), params: { id } });
    expect(await (await call('{"throughTs":100}')).json()).toEqual({ version: 1, ok: true, agentId: 'a', seenAt: 100 });
    for (const body of ['{', '{}', 'null', '[]', '{"throughTs":"100"}', '{"throughTs":-1}', '{"throughTs":1e999}']) expect((await call(body)).status).toBe(400);
    expect((await (await call('')).json()).seenAt).toBe(200);
    expect((await call('', 'missing')).status).toBe(404);
});
