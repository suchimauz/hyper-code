import {test, expect} from 'bun:test';
import failure from './lifecycleFailure';
import statusFor from './lifecycleFailureStatus';

const args = {agentId:'a',expectedGoalId:'g',expectedRunToken:'run',reason:'terminal_error' as const,terminal:true,codexPlanMode:false};
function fixture(status = 'active') {
    const trace: string[] = [];
    const writes: Array<{sql:string;params:any[]}> = [];
    const owner = {id:'a',run_token:'run',run_state:'running',archived_at:null as number|null};
    const goal = {goalId:'g',status,revision:2};
    let active = true;
    const ctx:any = {state:{procs:{db:{transactionStorage:{getStore:()=>({active})}}}},fns:{goal:{enabled:async()=>true,lifecycleFailureStatus:(o:any)=>statusFor(ctx,null,o)},procs:{db:{select:async(o:any)=>{trace.push(o.sql); if(o.sql.includes('FROM agents')) return [owner]; expect(o.params).toEqual(['a','g']); return [goal];},run:async(o:any)=>{writes.push(o);return {changes:1};}}}}};
    return {ctx,owner,goal,writes,trace,setActive:(value:boolean)=>{active=value;}};
}
test('disabled gate does not access transaction or new schema',async()=>{
    expect(await failure({fns:{goal:{enabled:async()=>false}}} as any,null,args)).toEqual({changed:false,reason:'disabled'});
});
test('requires caller transaction; never creates a nested transaction',async()=>{
    const f=fixture(); f.setActive(false);
    await expect(failure(f.ctx,null,args)).rejects.toThrow('transaction');
    expect(f.trace).toHaveLength(0);
});
for (const status of ['active','paused','blocked','usage_limited','budget_limited','complete'] as const) {
    for (const reason of ['terminal_error','usage_limit','interrupted'] as const) test(`${reason} from ${status} preserves pinned priority`,async()=>{
        const expected=reason==='usage_limit'&&(status==='active'||status==='budget_limited')?'usage_limited':reason==='terminal_error'&&status==='active'?'blocked':null;
        expect(await statusFor({} as any,null,{status,reason,terminal:true,codexPlanMode:false})).toBe(expected);
        const f=fixture(status); const result=await failure(f.ctx,null,{...args,reason});
        expect(result.changed).toBe(expected!==null);
        expect(f.writes).toHaveLength(expected===null?0:2);
        if(expected!==null) expect(result.status).toBe(expected);
    });
}
test('accounting budget status cannot mask provider usage limit',async()=>{
    const f=fixture('budget_limited');
    expect(await failure(f.ctx,null,{...args,reason:'usage_limit'})).toEqual({changed:true,reason:'usage_limit',status:'usage_limited',revision:3});
    expect(f.trace[0]).toContain('FOR UPDATE');
    expect(f.trace[1]).toContain('AND goal_id = ?::uuid');
    expect(f.writes[1].params.slice(0,8)).toEqual(['a','g','set',2,3,'budget_limited','usage_limited','run']);
});
for (const variant of [{terminal:false},{codexPlanMode:true},{reason:'interrupted' as const}]) test(`ineligible ${JSON.stringify(variant)} skips all SQL`,async()=>{
    const f=fixture(); const result=await failure(f.ctx,null,{...args,...variant});
    expect(result.changed).toBe(false); expect(f.trace).toHaveLength(0); expect(f.writes).toHaveLength(0);
});
for (const variant of [{run_token:'replacement'},{run_token:''},{run_state:'idle'},{archived_at:12}]) test(`owner fence ${JSON.stringify(variant)} before goal lookup`,async()=>{
    const f=fixture();Object.assign(f.owner,variant);
    expect((await failure(f.ctx,null,args)).reason).toBe('fenced');
    expect(f.trace).toHaveLength(1);expect(f.writes).toHaveLength(0);
});
test('same-token replaced goal rejects captured ID without discovering new binding',async()=>{
    const f=fixture(); f.goal.goalId='replacement';
    expect((await failure(f.ctx,null,args)).reason).toBe('fenced');expect(f.writes).toHaveLength(0);
});
test('CAS failure rejects before audit',async()=>{
    const f=fixture();f.ctx.fns.procs.db.run=async(o:any)=>{f.writes.push(o);return {changes:0};};
    await expect(failure(f.ctx,null,args)).rejects.toThrow('conflict');expect(f.writes).toHaveLength(1);
});
test('audit failure propagates for caller rollback; helper never swallows or commits',async()=>{
    const f=fixture();f.ctx.fns.procs.db.run=async(o:any)=>{f.writes.push(o);if(o.sql.startsWith('INSERT'))throw new Error('audit unavailable');return {changes:1};};
    await expect(failure(f.ctx,null,args)).rejects.toThrow('audit unavailable');expect(f.writes).toHaveLength(2);
});
test('missing captured identity rejects instead of discovering current goal',async()=>{
    const f=fixture();await expect(failure(f.ctx,null,{...args,expectedGoalId:''})).rejects.toThrow('captured identity');expect(f.trace).toHaveLength(0);
});
test('revision overflow rejects without writes',async()=>{
    const f=fixture();f.goal.revision=Number.MAX_SAFE_INTEGER;await expect(failure(f.ctx,null,args)).rejects.toThrow('overflow');expect(f.writes).toHaveLength(0);
});
