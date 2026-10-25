import { afterEach, describe, expect, test } from 'bun:test';
import search from './search';

const originalFetch = globalThis.fetch;
const originalTimer = globalThis.setTimeout;
afterEach(() => { globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimer; });
const ctx = (engine = 'openserp', endpoint = 'http://127.0.0.1:7000') => ({ fns: {
    settings: { getString: async ({ key }: { key: string }) => key === 'defaultEngine' ? engine : endpoint },
    brave: { search: async () => ({ results: [{ title: 'Brave', url: 'https://brave.test/', description: '<strong>snippet</strong>' }] }) },
    browser: { googleSearch: async () => ({ results: [{ title: 'Google', url: 'https://google.test/', snippet: 'snippet' }] }) },
} }) as unknown as Context;
const row = (engine = 'duckduckgo', patch = {}) => ({ type: 'organic', engine, title: '<b>Actual title</b>', url: 'https://example.test/a', snippet: 'Actual &amp; snippet', ...patch });
const response = (results: object[]) => Response.json({ results });
function mockFetch(fn: (url: URL, init?: RequestInit) => Promise<Response> | Response) {
    const calls: URL[] = [];
    globalThis.fetch = ((input: URL | string, init?: RequestInit) => {
        const url = new URL(String(input)); calls.push(url); return Promise.resolve(fn(url, init));
    }) as typeof fetch;
    return calls;
}
function fastTimeouts() {
    const delays: number[] = [];
    globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number) => {
        delays.push(ms ?? 0); return originalTimer(fn, 5);
    }) as typeof setTimeout;
    return delays;
}

describe('OpenSERP search (DB-free)', () => {
    test('DDG success: actual fields, URL filtering, dedupe, limit; no Bing or result injection', async () => {
        const calls = mockFetch(() => response([
            row(), row('duckduckgo', { url: 'https://example.test/a#duplicate' }),
            row('duckduckgo', { url: 'javascript:alert(1)' }), row('duckduckgo', { url: 'file:///tmp/no' }),
            row('duckduckgo', { url: 'https://user:password@example.test/' }),
            row('bing', { url: 'https://wrong-provider.test/' }), row('duckduckgo', { title: '' }),
            row('duckduckgo', { url: 'https://example.test/b', title: 'Second' }), row('duckduckgo', { url: 'https://example.test/c' }),
        ]));
        const found = await search(ctx(), null, { query: ' x & y ', limit: 2 });
        expect(calls).toHaveLength(1);
        expect(calls[0].pathname).toBe('/duckduckgo/search');
        expect(calls[0].searchParams.get('text')).toBe('x & y');
        expect(calls[0].searchParams.get('limit')).toBe('2');
        expect(found.sourceEngine).toBe('duckduckgo');
        expect(found.engine).toBe('openserp');
        expect(found.results).toHaveLength(2);
        expect(found.results[0]).toEqual({ title: 'Actual title', url: 'https://example.test/a', description: 'Actual & snippet', descriptionHtml: null, publishedAt: null, language: null, site: null, extraSnippets: [] });
        expect(found.results[1].title).toBe('Second');
        expect(Object.keys(found).sort()).toEqual(['durationMs', 'engine', 'query', 'results', 'sourceEngine']);
    });
    for (const failure of ['empty', 'malformed', 'json', 'http', 'network', 'unusable']) {
        test(`${failure} DDG falls back to Bing exactly once`, async () => {
            const calls = mockFetch(url => {
                if (url.pathname === '/bing/search') return response([row('bing')]);
                if (failure === 'empty') return response([]);
                if (failure === 'malformed') return Response.json({ results: 'wrong' });
                if (failure === 'json') return new Response('not json');
                if (failure === 'http') return new Response('private body', { status: 503 });
                if (failure === 'network') throw new Error('transport contains secret');
                return response([row('duckduckgo', { url: 'data:text/html,bad' })]);
            });
            const found = await search(ctx(), null, { query: 'question' });
            expect(calls.map(url => url.pathname)).toEqual(['/duckduckgo/search', '/bing/search']);
            expect(found.sourceEngine).toBe('bing');
            expect(found.results).toHaveLength(1);
        });
    }
    for (const hangingBody of [false, true]) {
        test(`bounded timeout covers ${hangingBody ? 'JSON body' : 'fetch'} then Bing succeeds`, async () => {
            const delays = fastTimeouts();
            const signals: AbortSignal[] = [];
            mockFetch((url, init) => {
                signals.push(init!.signal!);
                if (url.pathname === '/bing/search') return response([row('bing')]);
                return hangingBody
                    ? { ok: true, json: () => new Promise(() => {}) } as unknown as Response
                    : new Promise(() => {});
            });
            const found = await search(ctx(), null, { query: 'question' });
            expect(found.sourceEngine).toBe('bing');
            expect(signals.every(signal => signal.aborted)).toBe(true);
            expect(delays).toHaveLength(2);
            expect(delays.every(delay => delay > 0 && delay <= 10_000)).toBe(true);
            expect(delays.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(20_000);
        });
    }
    test('both timeout: bounded rejection, no third provider', async () => {
        fastTimeouts();
        const calls = mockFetch(() => new Promise(() => {}));
        await expect(search(ctx(), null, { query: 'question' })).rejects.toThrow('OpenSERP failed');
        expect(calls).toHaveLength(2);
    });
    for (const empty of [false, true]) {
        test(`both ${empty ? 'empty' : 'HTTP fail'} reject without results/raw body`, async () => {
            const calls = mockFetch(() => empty ? response([]) : new Response('SECRET BODY', { status: 502 }));
            let message = '';
            try { await search(ctx(), null, { query: 'question' }); } catch (error) { message = String(error); }
            expect(message).toContain('OpenSERP failed');
            expect(message).toContain('duckduckgo:'); expect(message).toContain('bing:');
            expect(message).not.toContain('SECRET BODY'); expect(calls).toHaveLength(2);
        });
    }
    test('endpoint validation forbids credentials/query/hash/non-HTTP before fetch', async () => {
        const calls = mockFetch(() => response([row()]));
        for (const endpoint of ['https://user:pass@host/', 'https://host/?token=x', 'https://host/#x', 'file:///tmp']) {
            await expect(search(ctx('openserp', endpoint), null, { query: 'question' })).rejects.toThrow('openserpEndpoint');
        }
        expect(calls).toHaveLength(0);
    });
    test('explicit engine selection and endpoint base path; no browser', async () => {
        const calls = mockFetch((_url, init) => { expect(init?.redirect).toBe('error'); return response([row()]); });
        const found = await search(ctx('google-browser', 'http://127.0.0.1:7000/api/'), null, { query: 'question', engine: 'openserp' });
        expect(calls[0].pathname).toBe('/api/duckduckgo/search'); expect(found.engine).toBe('openserp');
    });
    test('Brave and Google retain their prior mapping with no HTTP backend calls', async () => {
        const calls = mockFetch(() => { throw new Error('unexpected fetch'); });
        for (const engine of ['brave', 'google-browser'] as const) {
            const found = await search(ctx(engine), null, { query: 'question' });
            expect(found.engine).toBe(engine); expect(found.sourceEngine).toBeUndefined();
            expect(found.results[0].description).toBe('snippet');
            expect(found.results[0].title).toBe(engine === 'brave' ? 'Brave' : 'Google');
        }
        expect(calls).toHaveLength(0);
    });
});
