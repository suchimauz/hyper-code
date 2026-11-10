import { expect, test } from 'bun:test';
import details from './contextDetails';
import budget from './contextBudget';

test('durable usage sums real counters and never invents cache or timing', async () => {
    const ctx: any = { fns: { procs: { db: { select: async () => [ { payload: JSON.stringify({ usage: { prompt_tokens: 100, completion_tokens: 20 } }) }, { payload: JSON.stringify({ usage: { prompt_tokens: 200, completion_tokens: 40 } }) } ] } } } };
    const result = await details(ctx, null, { agentId: 'test' });
    expect(result.usage).toEqual({ requests: 2, inputTokens: 300, outputTokens: 60, uncachedInputTokens: null, cachedInputTokens: null, cacheHitRatio: null, cacheWriteTokens: null, costUsd: null, price: null });
    expect(Object.values(result.session)).toEqual([null, 0, null, null]);
    ctx.fns.procs.db.select = async () => [{ payload: 'bad json' }];
    expect((await details(ctx, null, { agentId: 'test' })).usage.inputTokens).toBeNull();
    ctx.fns.procs.db.select = async () => [];
    expect((await details(ctx, null, { agentId: 'test' })).usage.outputTokens).toBe(0);
});

test('budget builds one preview, partitions system messages and leaves default shape intact', async () => {
    let previews = 0;
    const ctx: any = { state: { agent: { test: { model: 'mock' } } }, fns: {
        procs: { db: { select: async ({ sql }: any) => sql.includes('FROM agents') ? [{ model: 'mock', sleep_context: null }] : [] } },
        session: { getMessages: async () => [] },
        agent: { buildLlmRequest: async () => { previews++; return { messages: [{ role: 'system', content: 'abc' }, { role: 'user', content: 'hello' }], system: 'x', context: { mode: 'full', fallback: null, revision: null } }; }, wireTools: () => [], contextTokens: async ({ fallbackTokens }: any) => ({ tokens: fallbackTokens, source: 'estimate' }) },
        llm: { resolveEndpoint: async () => ({ api: 'mock' }) },
        compaction: { calibration: async () => ({ factor: 1, samples: 0, source: 'heuristic' }), contextWindow: async () => 1000, estimateTokens: async ({ messages }: any) => messages.reduce((s: number, m: any) => s + m.content.length, 0) },
    } };
    const measured = await budget(ctx, null, { agentId: 'test', breakdown: true });
    expect(previews).toBe(1);
    expect(measured.breakdown).toEqual({ systemPrompt: 4, toolDefinitions: 0, messages: 5 });
    expect(measured.estimatedTokens).toBe(9);
    expect(await budget(ctx, null, { agentId: 'test' })).not.toHaveProperty('breakdown');
    // Synthetic bootstrap user + ack belong to instructions, not the conversation.
    ctx.fns.agent.buildLlmRequest = async () => ({ system: 'x', bootstrapMessageCount: 2, messages: [{role:'user',content:'instructions'}, {role:'assistant',content:'ack'}, {role:'user',content:'hello'}, {role:'system',content:'abc'}], context: {mode:'full',fallback:null,revision:null} });
    const semantic = await budget(ctx, null, {agentId:'test',breakdown:true});
    expect(semantic.breakdown).toEqual({systemPrompt:19,toolDefinitions:0,messages:5});
    expect(semantic.estimatedTokens).toBe(24);
});
