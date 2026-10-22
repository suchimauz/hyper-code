import { test, expect } from 'bun:test';
import discover from './zaiCodingModels';
import stream from './streamOpenAI';
import convert from './toOpenAIMessages';

function catalogueCtx(key: string | null, response: Response) {
    const requests: any[] = [];
    const ctx: any = { fns: {
        secrets: { resolveSetting: async () => key },
        llm: { connectFetch: async (opts: any) => { requests.push(opts); return response; } },
        procs: { log: { warn: async () => {} } },
    } };
    return { ctx, requests };
}

test('Z.ai catalogue uses only authenticated Coding endpoint and deduplicates IDs', async () => {
    const { ctx, requests } = catalogueCtx('test-key', Response.json({ data: [{ id: 'glm-5.3' }, { id: 'glm-5.3' }, { id: '<bad>' }] }));
    expect(await discover(ctx, null, {})).toEqual(['glm-5.3']);
    expect(requests[0].url).toBe('https://api.z.ai/api/coding/paas/v4/models');
    expect(requests[0].init.headers.authorization).toBe('Bearer test-key');
    expect(requests[0].init.redirect).toBe('error');
});

test('Z.ai catalogue makes no request without credentials', async () => {
    const { ctx, requests } = catalogueCtx(null, Response.json({}));
    expect(await discover(ctx, null, {})).toEqual([]);
    expect(requests).toHaveLength(0);
});

test('Z.ai catalogue does not fall back after a subscription error', async () => {
    const { ctx, requests } = catalogueCtx('test-key', new Response('', { status: 403 }));
    expect(await discover(ctx, null, {})).toEqual([]);
    expect(requests).toHaveLength(1);
});

test('Z.ai tool reasoning survives canonical replay and stays provider-specific', async () => {
    let messages: any[] = [{ role: 'user', content: 'test' }];
    let provider = 'zai-coding';
    let request: any;
    const ctx: any = { fns: {
        agent: { buildLlmRequest: async () => ({ system: '', messages }), wireTools: () => [] },
        llm: {
            resolveEndpoint: async () => ({ provider, api: 'openai', modelId: 'glm-5.3', url: 'https://mock.test' }),
            toOpenAIMessages: (opts: any) => convert(ctx, null, opts),
            resolveReasoningEffort: async () => ({ applied: 'xhigh' }),
            connectFetch: async (opts: any) => {
                request = JSON.parse(opts.init.body);
                return Response.json({ choices: [{ message: { reasoning_content: 'reasoning', tool_calls: [{ id: 'call1', type: 'function', function: { name: 'test', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] });
            },
        },
    } };
    const agent: any = { model: 'zai-coding:glm-5.3' };
    const first = await stream(ctx, null, { agent });
    expect(request.thinking).toEqual({ type: 'enabled' });
    expect(request.reasoning_effort).toBe('max');
    messages = [{ role: 'assistant', content: '', tool_calls: JSON.parse(JSON.stringify(first.toolCalls)) }, { role: 'tool', tool_call_id: 'call1', content: 'ok' }];
    await stream(ctx, null, { agent });
    expect(request.messages[0].reasoning_content).toBe('reasoning');
    expect(request.messages[0].tool_calls[0].function.arguments).toBe('{}');
    provider = 'oneapi';
    await stream(ctx, null, { agent });
    expect(request.messages[0].reasoning_content).toBeUndefined();
    expect(request.reasoning_effort).toBeUndefined();
});
