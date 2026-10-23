import { test, expect } from 'bun:test';
import connect from './connectFetch';

test('header deadline aborts the pending request', async () => {
    const original = globalThis.fetch;
    let signal: AbortSignal | undefined;
    globalThis.fetch = ((_url: any, init: any) => {
        signal = init.signal;
        return new Promise(() => {});
    }) as typeof fetch;
    try {
        await expect(connect({} as any, null, {url:'https://example.test',init:{},ms:5})).rejects.toThrow('no response from provider in 0.005s');
        expect(signal?.aborted).toBe(true);
    } finally { globalThis.fetch = original; }
});

test('header success clears deadline without aborting body', async () => {
    const original = globalThis.fetch;
    let signal: AbortSignal | undefined;
    globalThis.fetch = (async (_url: any, init: any) => {
        signal = init.signal;
        return new Response('ok');
    }) as typeof fetch;
    try {
        const response = await connect({} as any, null, {url:'https://example.test',init:{},ms:5});
        await Bun.sleep(15);
        expect(signal?.aborted).toBe(false);
        expect(await response.text()).toBe('ok');
    } finally { globalThis.fetch = original; }
});
