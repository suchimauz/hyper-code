import { test, expect } from 'bun:test';
import delta from './accountingDelta';
import elapsed from './accountingElapsed';
import checkpoint from './accountingCheckpoint';
import checkpointTx from './accountingCheckpointTx';
import authorize from './delegationAuthorize';
import lock from './delegationLock';
const zero = { input: '0', cached: '0', output: '0' };
const ctx = {} as Context;
test('signed saturation and final-only clamp', async () => {
    expect(await delta(ctx, null, { current: { input: '5', cached: '10', output: '2' }, baseline: zero })).toEqual({ raw: '-3', increment: '0' });
    expect((await delta(ctx, null, { current: { input: '5', cached: '3', output: '4' }, baseline: { input: '10', cached: '10', output: '0' } })).increment).toBe('6');
    expect((await delta(ctx, null, { current: { input: '9223372036854775807', cached: '0', output: '1' }, baseline: zero })).increment).toBe('9223372036854775807');
});
test('elapsed carries remainder and restore excludes downtime', async () => {
    expect(await elapsed(ctx, null, { nowMs: 1999, baselineMs: 0 })).toEqual({ seconds: 1, baselineMs: 1000 });
    expect(await elapsed(ctx, null, { nowMs: 12, baselineMs: 9999, restore: true })).toEqual({ seconds: 0, baselineMs: 12 });
});
function harness() {
    let goal = { goalId: '00000000-0000-4000-8000-000000000001', revision: 1, status: 'active', tokensUsed: 0, timeUsedSeconds: 0, tokenBudget: 5 };
    let rows: any[] = [];
    let carry: any = null;
    let writes = 0;
    let enabled = true;
    let token = 't';
    let fail = false;
    let active = false;
    let reads = 0;
    let idle = false, revoked = false;
    const locks: string[] = [];
    let authorizations = 0;
    const c: any = { state: { procs: { db: { transactionStorage: { getStore: () => active ? {active:true} : undefined } } } }, fns: { goal: { delegationAuthorize: async(o:any)=>{authorizations++;expect(active).toBe(true);return authorize(c,null,o);}, delegationLock:(o:any)=>lock(c,null,o), accountingCheckpointTx: (o:any) => checkpointTx(c,null,o), enabled: async () => enabled, read: async () => ({ enabled: true, goal: { ...goal } }), accountingDelta: (o: any) => delta(ctx, null, o), accountingElapsed: (o: any) => elapsed(ctx, null, o) }, procs: { db: { transaction: async ({ fn }: any) => { const saved = { ...goal }; const savedRows = [...rows]; const savedCarry = carry; try {
                        active = true;
                        return await fn();
                    }
                    catch (e) {
                        goal = saved;
                        rows = savedRows;
                        carry = savedCarry;
                        throw e;
                    } finally { active = false; } }, select: async ({ sql, params }: any) => {
                        reads++;
                        if (sql.includes('FROM goal_elapsed_carry')) return carry ? [carry] : [];
                        if (sql.includes('FROM agents')) {
                            locks.push(params[0]);
                            return [{ run_token: params[0]==='child' ? token : idle ? null : token, run_state:params[0]==='child'||!idle?'running':'idle', archived_at:null,stopped_at:null }];
                        }
                        if(sql.includes('FROM goal_delegations')) return [{capability_id:'cap',root_agent_id:'a',goal_id:goal.goalId,source_agent_id:'child',source_run_id:'t',parent_capability_id:null,revoked_at:revoked?1:null}];
                        if (sql.includes('checkpoint_id=?'))
                            return rows.filter(r => r.key === params[4] && r.run === params[3] && r.source === params[2]);
                        return rows.filter(r => r.run === params[3] && r.source === params[2]).slice(-1);
                    }, run: async ({ sql, params }: any) => { writes++; if (sql.startsWith('UPDATE')) {
                        goal = { ...goal, tokensUsed: params[0], timeUsedSeconds: params[1], status: params[2], revision: params[3] };
                        return { changes: 1 };
                    } if (sql.startsWith('INSERT INTO goal_elapsed_carry')) { carry = {goal_id:params[1],clock_epoch:params[2],remainder_ms:params[3]}; return {changes:1}; } if (fail)
                        throw Error('insert failed'); rows.push({ run:params[3],source:params[2],key: params[4], snapshot: JSON.parse(params[6]), result: JSON.parse(params[7]) }); return { changes: 1 }; } } } } };
    const opts: any = { agentId: 'a', goalId: '00000000-0000-4000-8000-000000000001', expectedRevision: 1, runToken: 't', sourceAgentId: 'a', runId: 'r', checkpointId: 'c', sequence: 0, clockEpoch: 'e', current: { input: '10', cached: '0', output: '0' }, quality: 'exact', boundaryGoalId: '00000000-0000-4000-8000-000000000001', boundaryRootAgentId: 'a', nowMs: 1500, initialNowMs: 0, initialBaseline: zero };
    return { c, opts, locks, get carry(){return carry;}, replaceGoal:(goalId:string)=>{goal={...goal,goalId,revision:1,tokensUsed:0,timeUsedSeconds:0};rows=[];}, seedLegacy:(snapshot:any)=>{rows.push({run:opts.runId,source:'a',snapshot});}, idle:()=>idle=true, revokeCapability:()=>revoked=true, get authorizations(){return authorizations;}, get goal() { return goal; }, get writes() { return writes; }, get reads() {return reads;}, disable: () => enabled = false, revoke: () => token = '', fail: () => fail = true, recover: () => fail = false };
}
test('disabled stops before transaction; unknown evidence permits soft accounting', async () => { const h = harness(); h.disable(); await expect(checkpoint(h.c, null, h.opts)).rejects.toThrow('disabled'); expect(h.writes).toBe(0); const j = harness(); const result=await checkpoint(j.c, null, { ...j.opts, quality: 'unknown', current: zero }); expect(result.tokensUsed).toBe(0); expect(result.status).toBe('active'); });
test('checkpoint soft overshoot, dedupe, fractional baseline, CAS retry', async () => {
    const h = harness();
    const first = await checkpoint(h.c, null, h.opts);
    expect(first.budgetTransition).toBe(true);
    expect(first.tokensUsed).toBe(10);
    const duplicate = await checkpoint(h.c, null, h.opts);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.budgetTransition).toBe(false);
    expect(h.goal.tokensUsed).toBe(10);
    const next = { ...h.opts, checkpointId: 'd', sequence: 1, nowMs: 2200, current: { input: '12', cached: '0', output: '0' } };
    await expect(checkpoint(h.c, null, next)).rejects.toThrow('revision');
    const r = await checkpoint(h.c, null, { ...next, expectedRevision: 2 });
    expect(r.tokensUsed).toBe(12);
    expect(r.timeUsedSeconds).toBe(2);
    expect(r.status).toBe('budget_limited');
});
test('failed commit retains baseline; revoked and attribution mismatches reject', async () => { const h = harness(); h.fail(); await expect(checkpoint(h.c, null, h.opts)).rejects.toThrow('insert failed'); expect(h.goal.tokensUsed).toBe(0); h.recover(); expect((await checkpoint(h.c, null, h.opts)).tokensUsed).toBe(10); h.revoke(); await expect(checkpoint(h.c, null, h.opts)).rejects.toThrow('inactive'); await expect(checkpoint(h.c, null, { ...h.opts, boundaryGoalId: 'new' })).rejects.toThrow('boundary'); });
function child(h:ReturnType<typeof harness>) {return {...h.opts,sourceAgentId:'child',runId:'t',authority:Object.freeze({capabilityId:'cap',rootAgentId:'a',goalId:h.opts.goalId,sourceAgentId:'child',sourceRunId:'t',allowContinuation:false})};}
test('idle-root descendants charge once, never elapsed, and lock root before source', async () => {
 const h=harness();h.idle();const o=child(h);
 const r=await checkpoint(h.c,null,o);expect(r.tokensUsed).toBe(10);expect(r.elapsedSeconds).toBe(0);expect(r.timeUsedSeconds).toBe(0);
 expect(h.locks.slice(0,2)).toEqual(['a','child']);
 expect((await checkpoint(h.c,null,o)).duplicate).toBe(true);expect(h.goal.tokensUsed).toBe(10);expect(h.authorizations).toBe(2);
 await expect(checkpoint(h.c,null,{...o,checkpointId:'other',expectedRevision:2})).rejects.toThrow('order');
});
test('descendants require capability, actual claim and live authorization on every replay',async()=>{
 const h=harness();const o=child(h);
 await expect(checkpoint(h.c,null,{...o,authority:undefined})).rejects.toThrow('requires capability');
 await expect(checkpoint(h.c,null,{...o,runId:'lifecycle'})).rejects.toThrow('scope');
 await expect(checkpoint(h.c,null,{...o,runToken:'root-token'})).rejects.toThrow('scope');
 await checkpoint(h.c,null,o);h.revokeCapability();await expect(checkpoint(h.c,null,o)).rejects.toThrow('revoked');
 expect(h.goal.tokensUsed).toBe(10);
 const j=harness();j.revoke();await expect(checkpoint(j.c,null,child(j))).rejects.toThrow('claim revoked');expect(j.writes).toBe(0);
});
test('Stop helper reauthorizes inside same transaction without nesting',async()=>{
 const h=harness();h.idle();const o=child(h);
 await h.c.fns.procs.db.transaction({fn:async()=>{
  expect((await checkpointTx(h.c,null,o)).elapsedSeconds).toBe(0);
  expect((await checkpointTx(h.c,null,o)).duplicate).toBe(true);
 }});expect(h.authorizations).toBe(2);
});
test('transaction-only helper rejects absent scope before any SQL', async () => {
    const h=harness();
    await expect(checkpointTx(h.c,null,h.opts)).rejects.toThrow('requires active transaction');
    expect(h.reads).toBe(0); expect(h.writes).toBe(0);
});
test('transaction-only helper retains duplicate and run guard semantics', async () => {
    const h=harness();
    await h.c.fns.procs.db.transaction({fn:async()=>{
        const r=await checkpointTx(h.c,null,h.opts); expect(r.tokensUsed).toBe(10);
        expect((await checkpointTx(h.c,null,h.opts)).duplicate).toBe(true);
        h.revoke(); await expect(checkpointTx(h.c,null,h.opts)).rejects.toThrow('inactive');
    }});
});

test('root fractions span runs excluding idle; duplicates and CAS retries preserve carry', async () => {
 const h=harness(); const a={...h.opts,nowMs:600,current:zero};
 await checkpoint(h.c,null,a); expect(h.carry.remainder_ms).toBe(600);
 const b={...a,runId:'run2',checkpointId:'b',initialNowMs:1000000,nowMs:1000600,expectedRevision:2};
 await expect(checkpoint(h.c,null,{...b,expectedRevision:1})).rejects.toThrow('revision');
 expect(h.carry.remainder_ms).toBe(600);
 const r=await checkpoint(h.c,null,b); expect(r.elapsedSeconds).toBe(1); expect(h.carry.remainder_ms).toBe(200);
 expect((await checkpoint(h.c,null,b)).duplicate).toBe(true); expect(h.carry.remainder_ms).toBe(200);
 const c={...b,checkpointId:'c',sequence:1,expectedRevision:3,nowMs:1001400};
 expect((await checkpoint(h.c,null,c)).elapsedSeconds).toBe(1); expect(h.carry.remainder_ms).toBe(0);
});
test('clock epoch restart discards fraction but counts only new run active duration',async()=>{
 const h=harness(); await checkpoint(h.c,null,{...h.opts,nowMs:600,current:zero});
 const r=await checkpoint(h.c,null,{...h.opts,runId:'restart',clockEpoch:'new',nowMs:610,initialNowMs:10,current:zero,expectedRevision:2});
 expect(r.elapsedSeconds).toBe(0); expect(h.carry.remainder_ms).toBe(600);
});
test('legacy baseline adopted once; failed receipt rolls carry back; descendants preserve carry',async()=>{
 const h=harness(); h.seedLegacy({current:zero,sequence:0,clockEpoch:'e',nowMs:600,baselineMs:0});
 const o={...h.opts,checkpointId:'legacy',sequence:1,nowMs:1200,current:zero};
 h.fail(); await expect(checkpoint(h.c,null,o)).rejects.toThrow('insert failed'); expect(h.carry).toBeNull();
 h.recover(); expect((await checkpoint(h.c,null,o)).elapsedSeconds).toBe(1); expect(h.carry.remainder_ms).toBe(200);
 await checkpoint(h.c,null,{...child(h),expectedRevision:2}); expect(h.carry.remainder_ms).toBe(200);
});

test('replacement identity discards old carry; same-run epoch reset excludes old clock',async()=>{
 const h=harness(); await checkpoint(h.c,null,{...h.opts,nowMs:600,current:zero});
 const id='00000000-0000-4000-8000-000000000002'; h.replaceGoal(id);
 const r=await checkpoint(h.c,null,{...h.opts,goalId:id,boundaryGoalId:id,runId:'replacement',nowMs:10600,initialNowMs:10000,current:zero});
 expect(r.elapsedSeconds).toBe(0);expect(h.carry.remainder_ms).toBe(600);expect(h.carry.goal_id).toBe(id);
 const j=harness();await checkpoint(j.c,null,{...j.opts,nowMs:600,current:zero});
 const restored=await checkpoint(j.c,null,{...j.opts,checkpointId:'restore',sequence:1,clockEpoch:'reset',nowMs:20,current:zero,expectedRevision:2});
 expect(restored.elapsedSeconds).toBe(0);expect(j.carry.remainder_ms).toBe(0);
});
