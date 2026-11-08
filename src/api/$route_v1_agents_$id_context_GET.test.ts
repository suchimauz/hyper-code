import { expect, test } from 'bun:test';
import route from './$route_v1_agents_$id_context_GET';

test('context route keeps budget compatible and exposes only aggregate details', async () => {
    let calls = 0;
    const ctx: any = { fns: { procs: { db: { select: async () => [{ id: 'test' }] } }, agent: {
        contextBudget: async (opts: any) => { calls++; expect(opts.breakdown).toBe(true); return { estimatedTokens: 20, breakdown: { systemPrompt: 10, toolDefinitions: 5, messages: 5 } }; },
        contextDetails: async () => ({ breakdown: null, session: { llmTimeMs: null }, usage: { outputTokens: 4 } }),
    } } };
    const opts = { req: new Request('http://localhost/api/v1/agents/test/context'), params: { id: 'test' } };
    const response = await route(ctx, null, opts);
    const body = await response.json();
    expect(calls).toBe(1);
    expect(body.budget).toEqual({ estimatedTokens: 20 });
    expect(body.details.breakdown.messages).toBe(5);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    ctx.fns.agent.contextDetails = async () => { throw new Error('unavailable'); };
    expect(await (await route(ctx, null, opts)).json()).toEqual({ budget: { estimatedTokens: 20 }, details: null });
    ctx.fns.procs.db.select = async () => [];
    expect((await route(ctx, null, opts)).status).toBe(404);
});
