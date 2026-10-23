import { expect, test } from 'bun:test';
import setAutomation from './setAutomation';
import save from '../session/save';
import load from '../session/load';
import route from './$route_$id_automation_POST';

function fixture() {
    const row: any = { id: 'synthetic', model: 'mock:test', scratchpad: '{}', function_rag_enabled: false, function_rag_gate_enabled: false, jev_rerank_enabled: false, jev_model_routing_enabled: false };
    const live: any = { id: row.id, model: row.model, createdBy: null, scratchpad: {} };
    const ctx: any = { state: { agent: { synthetic: live } }, fns: { events: { refreshAgentMeta() {} }, session: { syncAgentState: ({ agent }: any) => agent }, procs: { db: {
        select: async () => [row],
        run: async ({ sql, params }: any) => {
            if (sql.startsWith('UPDATE')) {
                [row.function_rag_enabled, row.function_rag_gate_enabled, row.jev_rerank_enabled, row.jev_context_enabled, row.jev_agent_routing_enabled, row.jev_model_routing_enabled] = params;
            } else {
                const cols = sql.match(/INSERT INTO agents \(([^)]+)\)/)[1].split(',').map((s: string) => s.trim());
                cols.slice(0, -2).forEach((col: string, i: number) => { row[col] = params[i]; });
                expect((sql.match(/\?/g) ?? []).length).toBe(params.length);
            }
        },
    } }, agent: {} } };
    ctx.fns.agent.setAutomation = (opts: any) => setAutomation(ctx, null, opts);
    return { ctx, row, live };
}

test('isolated save/load and partial updates preserve independent context opt-in', async () => {
    const { ctx, live } = fixture();
    expect((await load(ctx, null, { id: live.id }))?.jevModelRoutingEnabled).toBe(false);
    await setAutomation(ctx, null, { id: live.id, jevModelRoutingEnabled: true });
    await setAutomation(ctx, null, { id: live.id, functionRagEnabled: false });
    await save(ctx, null, { agent: live });
    const restored = await load(ctx, null, { id: live.id });
    expect(restored?.jevModelRoutingEnabled).toBe(true);
    expect(restored?.functionRagEnabled).toBe(false);
    await setAutomation(ctx, null, { id: live.id, jevModelRoutingEnabled: false });
    expect((await load(ctx, null, { id: live.id }))?.jevModelRoutingEnabled).toBe(false);
});

test('isolated POST handles explicit opt-in, legacy omission and new unchecked toggle', async () => {
    const { ctx, live } = fixture();
    const post = (body: string) => route(ctx, null, { params: { id: live.id }, req: new Request('http://localhost/automation', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }) });
    expect((await post('jevModelRoutingPresent=1&jevModelRoutingEnabled=1')).status).toBe(204);
    expect(live.jevModelRoutingEnabled).toBe(true);
    await post('functionRagEnabled=1');
    expect(live.jevModelRoutingEnabled).toBe(true);
    await post('jevModelRoutingPresent=1');
    expect(live.jevModelRoutingEnabled).toBe(false);
});
