import { test, expect } from 'bun:test';

async function setup() {
    const handle = (await import('./handle')).default;
    const calls: Array<[string, any]> = [];
    const ctx: any = { fns: { canvas: {
        authorizeHttp: async (opts: any) => { calls.push(['authorize', opts]); return null; },
        list: async (opts: any) => { calls.push(['list', opts]); return [{ id: 1, kind: 'openspec.workspace', args: { dir: '/owned' }, closedAt: null }]; },
        show: async (opts: any) => { calls.push(['show', opts]); return { itemId: 1 }; },
    }, auth: { verifyCsrf: async ({ token }: any) => token === 'valid' }, openspec: {} } };
    for (const name of ['watch', 'snapshot', 'document', 'validateAll']) ctx.fns.openspec[name] = async (opts: any) => { calls.push([name, opts]); return { result: name }; };
    const request = (query = '&itemId=1', method = 'GET', token = '') => handle(ctx, null, { req: new Request('http://localhost/openspec?agentId=test' + query, { method, headers: { 'x-csrf-token': token } }) });
    return { ctx, calls, request };
}

test('authorization prevents every operation for unauthorized agents', async () => {
    for (const method of ['GET', 'POST']) {
        const { ctx, calls, request } = await setup();
        ctx.fns.canvas.authorizeHttp = async () => new Response('denied', { status: 403 });
        expect((await request('', method, 'valid')).status).toBe(403);
        expect(calls).toEqual([]);
    }
});

test('opening requires CSRF and ignores caller paths and hosts', async () => {
    const { calls, request } = await setup();
    expect((await request('', 'POST')).status).toBe(403);
    expect(calls.some(([name]) => name === 'show')).toBe(false);
    const response = await request('&dir=/foreign&host=remote', 'POST', 'valid');
    expect(response.status).toBe(200);
    expect(calls.find(([name]) => name === 'show')?.[1]).toEqual({ agentId: 'test', kind: 'openspec.workspace', args: {} });
});

test('foreign, unknown, closed and wrong-kind items cannot be read', async () => {
    const { ctx, calls, request } = await setup();
    for (const items of [[], [{ id: 2, kind: 'openspec.workspace', args: { dir: '/foreign' } }], [{ id: 1, kind: 'file', args: { dir: '/other' } }], [{ id: 1, kind: 'openspec.workspace', args: { dir: '/closed' }, closedAt: 123 }]]) {
        ctx.fns.canvas.list = async () => items;
        expect((await request()).status).toBe(404);
    }
    expect(calls.some(([name]) => ['watch', 'snapshot', 'document', 'validateAll'].includes(name))).toBe(false);
});

test('fixed reads use only owned item directory and snapshot touches watcher first', async () => {
    const { calls, request } = await setup();
    for (const [op, fn] of [['snapshot', 'snapshot'], ['doc', 'document'], ['validate', 'validateAll']]) {
        const response = await request(`&itemId=1&op=${op}&id=change:login:tasks&dir=/foreign&host=remote`);
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.json()).toEqual({ result: fn });
        expect(calls.find(([name]) => name === fn)?.[1]).toEqual(fn === 'document' ? { dir: '/owned', id: 'change:login:tasks' } : { dir: '/owned' });
    }
    expect(calls.filter(([name]) => ['watch', 'snapshot'].includes(name)).map(([name]) => name)).toEqual(['watch', 'snapshot']);
    expect(calls.find(([name]) => name === 'list')?.[1]).toEqual({ agentId: 'test' });
});

test('unsupported operations, methods, malformed item IDs and backend failures are bounded', async () => {
    const { ctx, request } = await setup();
    expect((await request('&itemId=1&op=run')).status).toBe(400);
    expect((await request('', 'DELETE')).status).toBe(405);
    for (const id of ['', 'NaN', '0', '-1', '1.5']) expect((await request('&itemId=' + id)).status).toBe(400);
    ctx.fns.openspec.document = async () => { throw new Error('Invalid artifact'); };
    const response = await request('&itemId=1&op=doc&id=../secret');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid artifact' });
});

test('both route wrappers delegate the original request', async () => {
    for (const method of ['GET', 'POST']) {
        const route = (await import(`./$route__${method}.ts`)).default;
        const req = new Request('http://localhost/openspec?agentId=test', { method });
        const expected = new Response('ok');
        const ctx: any = { fns: { openspec: { handle: async (opts: any) => { expect(opts.req).toBe(req); return expected; } } } };
        expect(await route(ctx, null, { req })).toBe(expected);
    }
});

test('watch op keeps the owned workspace watcher alive and returns only its key', async () => {
    const { calls, request } = await setup();
    const response = await request('&itemId=1&op=watch&dir=/foreign');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: 'watch' });
    expect(calls.filter(([name]) => name === 'watch')).toEqual([['watch', { dir: '/owned' }]]);
    expect(calls.some(([name]) => name === 'snapshot')).toBe(false);
});
