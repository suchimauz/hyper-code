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
                const columns = sql.match(/SET (.+), updated_at/)[1].split(',').map((s: string) => s.trim().split(' ')[0]);
                columns.forEach((col: string, i: number) => { row[col] = params[i]; });
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


const independent = ['jevContextEnabled', 'jevAgentRoutingEnabled', 'jevModelRoutingEnabled', 'jevEvidenceEnabled', 'jevFileRankingEnabled', 'jevResultReviewEnabled', 'jevRiskReviewEnabled'];

test('compaction opt-in defaults false on legacy load and new save', async () => {
    const { ctx, live, row } = fixture();
    expect((await load(ctx, null, { id: live.id }))?.jevCompactionEnabled).toBe(false);
    await save(ctx, null, { agent: live });
    expect(row.jev_compaction_enabled).toBe(false);
});

test('compaction persists independently and omitted setAutomation flags are preserved', async () => {
    const { ctx, live, row } = fixture();
    const flags = await setAutomation(ctx, null, { id: live.id, jevCompactionEnabled: true });
    expect(flags.jevCompactionEnabled).toBe(true);
    for (const flag of independent) expect(flags[flag]).toBe(false);
    await setAutomation(ctx, null, { id: live.id, functionRagEnabled: false });
    expect(live.jevCompactionEnabled).toBe(true);
    await save(ctx, null, { agent: live });
    expect((await load(ctx, null, { id: live.id }))?.jevCompactionEnabled).toBe(true);
    for (const flag of independent) await setAutomation(ctx, null, { id: live.id, [flag]: true });
    await setAutomation(ctx, null, { id: live.id, jevCompactionEnabled: false });
    expect(row.jev_compaction_enabled).toBe(false);
    for (const flag of independent) expect(live[flag]).toBe(true);
    await save(ctx, null, { agent: live });
    expect((await load(ctx, null, { id: live.id }))?.jevCompactionEnabled).toBe(false);
});

test('compaction route has a distinct presence marker; legacy and unrelated forms never reset it', async () => {
    const { ctx, live } = fixture();
    const post = (body: string) => route(ctx, null, { params: { id: live.id }, req: new Request('http://localhost/automation', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }) });
    expect((await post('jevCompactionPresent=1&jevCompactionEnabled=1')).status).toBe(204);
    expect(live.jevCompactionEnabled).toBe(true);
    for (const body of ['', 'functionRagEnabled=1', 'jevContextPresent=1', 'jevResultReviewPresent=1', 'jevRiskReviewPresent=1']) {
        await post(body);
        expect(live.jevCompactionEnabled).toBe(true);
    }
    await post('jevCompactionPresent=1');
    expect(live.jevCompactionEnabled).toBe(false);
    await post('jevCompactionEnabled=1');
    expect(live.jevCompactionEnabled).toBe(true);
    await post('jevCompactionPresent=1&jevCompactionEnabled=0');
    expect(live.jevCompactionEnabled).toBe(false);
});

for (const value of [true, 1, 't', false, 0, 'f', undefined]) {
    test('compaction load normalizes stored boolean ' + String(value), async () => {
        const { ctx, live, row } = fixture();
        row.jev_compaction_enabled = value;
        expect((await load(ctx, null, { id: live.id }))?.jevCompactionEnabled).toBe(value === true || value === 1 || value === 't');
    });
}
