import {test,expect} from 'bun:test';
import externalApply from './externalApply';
import transition from './transition';
import persistTx from './persistTx';
import barrier from './ownerBarrier';

function fixture() {
 const goal={agentId:'a',goalId:'g',revision:2,schemaVersion:1,objective:'old',status:'paused',tokenBudget:100,tokensUsed:30,timeUsedSeconds:7,createdAt:1,updatedAt:2} as types.goal.State;
 const owner={run_token:null as string|null,run_state:'idle',archived_at:null,stopped_at:42};
 let outstanding=false,active=false,writes=0; const sqls:string[]=[];
 const ctx:any={state:{procs:{db:{transactionStorage:{getStore:()=>({active})}}}},fns:{goal:{enabled:async()=>true,transition:(o:any)=>transition(ctx,null,o)},procs:{db:{
 transaction:async({fn}:any)=>{active=true;try{return await fn();}finally{active=false;}},
 select:async({sql}:any)=>{sqls.push(sql);return sql.includes('FROM agents')?[owner]:[{outstanding}];},
 }}}};
 ctx.fns.goal.ownerBarrier=(o:any)=>barrier(ctx,null,o);
 ctx.fns.goal.runStopRegistry=async()=>undefined;
 ctx.fns.goal.persistTx=async(o:any)=>{writes++;return await ctx.fns.goal.transition({current:goal,command:o.command,expectedGoalId:o.expectedGoalId,expectedRevision:o.expectedRevision,agentId:'a',newGoalId:'new',now:9,maxTokenBudget:null});};
 const opts={agentId:'a',expectedGoalId:'g',expectedRevision:2,expectedRunToken:null};
 return {ctx,owner,goal,opts,sqls,setOutstanding:()=>{outstanding=true;},writes:()=>writes};
}
test('explicit active edit preserves usage and identity but does not resume or clear Stop',async()=>{
 const f=fixture();const r=await externalApply(f.ctx,null,{...f.opts,status:'active'});
 expect(r.goal).toMatchObject({goalId:'g',tokensUsed:30,timeUsedSeconds:7,status:'active',revision:3});
 expect(r.resume).toEqual({scheduled:false,reason:'native_goal_tools_unavailable'});
 expect(f.owner.stopped_at).toBe(42);expect(f.sqls.every(s=>s.startsWith('SELECT'))).toBe(true);
});
test('omitted status leaves paused goal paused',async()=>{const f=fixture();expect((await externalApply(f.ctx,null,{...f.opts,objective:'new'})).goal?.status).toBe('paused');});
test('exhausted goal cannot become active',async()=>{const f=fixture();f.goal.tokensUsed=100;expect((await externalApply(f.ctx,null,{...f.opts,status:'active'})).resume).toEqual({scheduled:false,reason:'goal_not_active'});});
test('running source rejected before work; pending provider cannot race an admitted mutation',async()=>{const f=fixture();await expect(externalApply(f.ctx,null,{...f.opts,expectedRunToken:'observed'})).rejects.toThrow('no live local source boundary');expect(f.writes()).toBe(0);expect(f.sqls).toHaveLength(0);});
test('idle observation rechecked against a newly claimed running token',async()=>{const f=fixture();f.owner.run_token='new';f.owner.run_state='running';await expect(externalApply(f.ctx,null,f.opts)).rejects.toThrow('claim changed');expect(f.writes()).toBe(0);});
test('queued owner rejected even with null claim',async()=>{const f=fixture();f.owner.run_state='queued';await expect(externalApply(f.ctx,null,f.opts)).rejects.toThrow('claim changed');expect(f.writes()).toBe(0);});
test('unrevoked descendant accounting authority blocks idle mutation',async()=>{const f=fixture();f.setOutstanding();await expect(externalApply(f.ctx,null,f.opts)).rejects.toThrow('outstanding');expect(f.writes()).toBe(0);});
test('CAS never silently refreshes concurrent revision',async()=>{const f=fixture();f.goal.revision=3;await expect(externalApply(f.ctx,null,f.opts)).rejects.toThrow('stale identity or revision');});
test('persistTx refuses calls without transaction',async()=>{const f=fixture();await expect(persistTx(f.ctx,null,{...f.opts,command:{kind:'set',status:'active'}})).rejects.toThrow('active transaction');});
test('outstanding SQL scopes both grants and claims to expected goal and ignores settled linked history',async()=>{const f=fixture();let checked=false;const select=f.ctx.fns.procs.db.select;f.ctx.fns.procs.db.select=async(o:any)=>{if(!o.sql.includes('FROM agents')){checked=true;expect(o.params).toEqual(['a','g','a','g']);expect(o.sql).toContain("task_state IN ('open','pending_review')");expect(o.sql).toContain('closed_at IS NULL OR reservation_id IS NULL');expect(o.sql).not.toContain('revoked_at IS NULL');}return select(o);};await externalApply(f.ctx,null,f.opts);expect(checked).toBe(true);});
