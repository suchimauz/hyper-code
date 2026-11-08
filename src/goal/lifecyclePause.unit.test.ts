import { test, expect } from 'bun:test';
import pause from './lifecyclePause';
import transition from './transition';

function fixture(status = 'active', enabled = true, inTransaction = true) {
    const writes: Array<{sql: string; params?: any}> = [];
    const goal = {agentId:'a',goalId:'g',schemaVersion:1,revision:2,objective:'work',status,tokenBudget:100,tokensUsed:4,timeUsedSeconds:1,createdAt:1,updatedAt:1};
    const ctx: any = {state:{procs:{db:{transactionStorage:{getStore:()=>({active:inTransaction})}}}},fns:{goal:{enabled:async()=>enabled,read:async()=>({enabled:true,goal}),transition:(opts:any)=>transition(ctx,null,opts)},procs:{db:{select:async()=>[{id:'a'}],run:async(opts:any)=>{writes.push(opts);return {changes:1};}}}}};
    return {ctx,writes};
}
test('disabled pause never requires transaction or database', async()=>{
    const ctx:any={fns:{goal:{enabled:async()=>false}}};
    expect(await pause(ctx,null,{agentId:'a'})).toEqual({paused:false,reason:'disabled'});
});
test('enabled pause requires transaction', async()=>{
    const {ctx,writes}=fixture('active',true,false);
    await expect(pause(ctx,null,{agentId:'a'})).rejects.toThrow('transaction');
    expect(writes).toHaveLength(0);
});
test('explicit Stop pauses active and audits revision',async()=>{
    const {ctx,writes}=fixture();
    expect(await pause(ctx,null,{agentId:'a'})).toEqual({paused:true,reason:'user_stop',revision:3});
    expect(writes).toHaveLength(2);
    expect(writes[0].params.slice(0,2)).toEqual(['paused',3]);
});
for(const status of ['paused','blocked','usage_limited','budget_limited','complete']) test(`Stop preserves ${status}`,async()=>{
    const {ctx,writes}=fixture(status);
    expect((await pause(ctx,null,{agentId:'a'})).paused).toBe(false);
    expect(writes).toHaveLength(0);
});
test('stale pause never writes audit',async()=>{
    const {ctx,writes}=fixture();
    ctx.fns.procs.db.run=async(opts:any)=>{writes.push(opts);return {changes:0};};
    await expect(pause(ctx,null,{agentId:'a'})).rejects.toThrow('conflict');
    expect(writes).toHaveLength(1);
});
test('captured token fences a replacement owner before reading goal', async()=>{
    const {ctx,writes}=fixture();
    ctx.fns.procs.db.select=async()=>[{id:'a',run_token:'new'}];
    ctx.fns.goal.read=async()=>{throw new Error('must not read replacement goal');};
    expect(await pause(ctx,null,{agentId:'a',expectedRunToken:'old'})).toEqual({paused:false,reason:'fenced'});
    expect(writes).toHaveLength(0);
});
test('captured goal identity fences replacement under same token', async()=>{
    const {ctx,writes}=fixture();
    ctx.fns.procs.db.select=async()=>[{id:'a',run_token:'old'}];
    expect(await pause(ctx,null,{agentId:'a',expectedRunToken:'old',expectedGoalId:'previous'})).toEqual({paused:false,reason:'fenced'});
    expect(writes).toHaveLength(0);
});
test('matching immutable binding pauses active goal', async()=>{
    const {ctx}=fixture();
    ctx.fns.procs.db.select=async()=>[{id:'a',run_token:'old'}];
    expect((await pause(ctx,null,{agentId:'a',expectedRunToken:'old',expectedGoalId:'g'})).paused).toBe(true);
});
