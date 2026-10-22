import { test, expect } from 'bun:test';
import discover from './minimaxCodingModels';

function catalogueCtx(key: string | null, response: Response) {
    const requests: any[] = [];
    const ctx: any = { fns: {
        secrets: { resolveSetting: async () => key },
        llm: { connectFetch: async (opts: any) => { requests.push(opts); return response; } },
        procs: { log: { warn: async () => {} } },
    } };
    return { ctx, requests };
}

test('MiniMax catalogue uses only the authenticated M Plan endpoint and deduplicates IDs', async () => {
    const { ctx, requests } = catalogueCtx('test-key', Response.json({ data: [{ id: 'MiniMax-M3' }, { id: 'MiniMax-M3' }, { id: '<bad>' }] }));
    expect(await discover(ctx, null, {})).toEqual(['MiniMax-M3']);
    expect(requests[0].url).toBe('https://api.minimax.io/anthropic/v1/models');
    expect(requests[0].init.headers['x-api-key']).toBe('test-key');
    expect(requests[0].init.redirect).toBe('error');
});

test('MiniMax catalogue makes no request without credentials', async () => {
    const { ctx, requests } = catalogueCtx(null, Response.json({}));
    expect(await discover(ctx, null, {})).toEqual([]);
    expect(requests).toHaveLength(0);
});

test('MiniMax catalogue does not fall back after a subscription error', async () => {
    const { ctx, requests } = catalogueCtx('test-key', new Response('', { status: 403 }));
    expect(await discover(ctx, null, {})).toEqual([]);
    expect(requests).toHaveLength(1);
});
