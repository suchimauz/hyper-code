import { expect, test } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';
import route from './$route_$id_automation_POST';

test('context opt-in defaults off and persists independently through partial updates and saves', async () => {
    const ctx = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: 'mock:test' });
    expect((await ctx.fns.session.load({ id: agent.id })).jevContextEnabled).toBe(false);
    await ctx.fns.agent.setAutomation({ id: agent.id, jevContextEnabled: true });
    expect(agent.jevContextEnabled).toBe(true);
    expect(agent.functionRagEnabled).not.toBe(true);
    await ctx.fns.agent.setAutomation({ id: agent.id, functionRagEnabled: false });
    await ctx.fns.session.save({ agent });
    expect((await ctx.fns.session.load({ id: agent.id })).jevContextEnabled).toBe(true);
    await ctx.fns.agent.setAutomation({ id: agent.id, jevContextEnabled: false });
    expect((await ctx.fns.session.load({ id: agent.id })).jevContextEnabled).toBe(false);
});

test('legacy automation forms preserve opt-in; new unchecked forms disable it', async () => {
    const ctx = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: 'mock:test' });
    const post = (body: string) => route(ctx, null, { params: { id: agent.id }, req: new Request('http://localhost/automation', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }) });
    expect((await post('jevContextPresent=1&jevContextEnabled=1')).status).toBe(204);
    expect(agent.jevContextEnabled).toBe(true);
    await post('functionRagEnabled=1');
    expect(agent.jevContextEnabled).toBe(true);
    await post('jevContextPresent=1');
    expect(agent.jevContextEnabled).toBe(false);
});
