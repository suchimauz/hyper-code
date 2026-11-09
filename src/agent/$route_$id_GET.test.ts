import { test, expect, describe } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

async function ownerHeaders(ctx: any) {
    const user = await ctx.fns.auth.createUser({ name: 'Route Owner', password: 'test-password-123' });
    const token = await ctx.fns.procs.auth.sign({ sub: user.id, name: user.name, role: user.role, days: 1 });
    return { cookie: `${ctx.fns.procs.auth.cookieName({})}=${token}` };
}

describe('GET /agent/:id', () => {
    test('anonymous requests are rejected before revealing whether an agent exists', async () => {
        const ctx = await mkTestCtx();
        const res = await ctx.fns.procs.http.dispatch({ url: '/agent/nope' });
        expect(res.status).toBe(401);
    });

    test('redirects a stored agent missing from runtime state to React', async () => {
        const ctx = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: 'db-model', systemPrompt: '' });
        await ctx.fns.session.save({ agent });
        delete (ctx.state as any).agent?.[agent.id]; // redirects do not require a live runtime agent

        const headers = await ownerHeaders(ctx);
        const res = await ctx.fns.procs.http.dispatch({ url: '/agent/' + agent.id, headers });
        expect(res.status).toBe(307);
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(res.headers.get('Location')).toBe('/?agent=' + agent.id);
        expect(await res.text()).toBe('');
    });

    test('redirects legacy model-picker pages without rendering a second shell', async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: 'mock:test', systemPrompt: '' });
        await ctx.fns.session.save({ agent });

        const headers = await ownerHeaders(ctx);
        const res = await ctx.fns.procs.http.dispatch({ url: '/agent/' + agent.id, headers });
        expect(res.status).toBe(307);
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(res.headers.get('Location')).toBe('/?agent=' + agent.id);
        expect(await res.text()).toBe('');
    });

});
