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

const flags = [["jevEvidenceEnabled","jev_evidence_enabled"],["jevFileRankingEnabled","jev_file_ranking_enabled"],["jevResultReviewEnabled","jev_result_review_enabled"],["jevRiskReviewEnabled","jev_risk_review_enabled"]];
for (const [flag, column] of flags) {
 test(flag + ' defaults off, persists, preserves omitted and unrelated settings', async () => {
  const {ctx, row, live} = fixture();
  expect((await load(ctx, null, {id: live.id}))?.[flag]).toBe(false);
  await setAutomation(ctx, null, {id: live.id, jevContextEnabled:true, jevAgentRoutingEnabled:true, jevModelRoutingEnabled:true, [flag]:true});
  await setAutomation(ctx, null, {id: live.id, functionRagEnabled:false});
  await save(ctx, null, {agent:live});
  const restored = await load(ctx, null, {id:live.id});
  expect(restored?.[flag]).toBe(true);
  for(const previous of ['jevContextEnabled','jevAgentRoutingEnabled','jevModelRoutingEnabled']) expect(restored?.[previous]).toBe(true);
  for(const [other] of flags) if(other!==flag) expect(restored?.[other]).toBe(false);
  await setAutomation(ctx, null, {id: live.id, [flag]:false});
  expect(row[column]).toBe(false);
 });
 test(flag + ' POST supports explicit, legacy omitted, and unchecked presence marker', async () => {
  const {ctx,live}=fixture();
  const post=(body:string)=>route(ctx,null,{params:{id:live.id},req:new Request('http://localhost/automation',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body})});
  const marker=flag.replace('Enabled','Present');
  expect((await post(marker+'=1&'+flag+'=1')).status).toBe(204);
  expect(live[flag]).toBe(true);
  await post('functionRagEnabled=1'); expect(live[flag]).toBe(true);
  await post(marker+'=1'); expect(live[flag]).toBe(false);
  await post(flag+'=1'); expect(live[flag]).toBe(true);
 });
}
