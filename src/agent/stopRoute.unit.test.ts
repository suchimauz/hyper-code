import { test, expect } from 'bun:test';
import route from './$route_$id_stop_POST';

for (const [query, clearQueue] of [['', true], ['?clearQueue=0', false], ['?clearQueue=1', true]] as const) {
    test(`Stop route loads unloaded agent and respects queue choice ${query || '(default)'}`, async () => {
        const agent = { id: 'unloaded' };
        let stopped = false;
        const ctx: any = { state: { agent: {} }, fns: {
            session: { load: async ({ id }: any) => { expect(id).toBe(agent.id); return agent; } },
            agent: { stop: async (opts: any) => { expect(opts).toEqual({ agent, clearQueue }); stopped = true; } },
        } };
        const response = await route(ctx, null, { req: new Request('http://localhost/agent/unloaded/stop' + query), params: { id: agent.id } });
        expect(response.status).toBe(303);
        expect(stopped).toBe(true);
    });
}
test('Stop route reports missing agent rather than silently succeeding', async () => {
    const ctx: any = { state: {}, fns: { session: { load: async () => null } } };
    const response = await route(ctx, null, { req: new Request('http://localhost/agent/missing/stop'), params: { id: 'missing' } });
    expect(response.status).toBe(404);
});
