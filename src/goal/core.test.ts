import { describe, test, expect } from 'bun:test';
import transition from './transition';
import persist from './persist';
import persistTx from './persistTx';
import read from './read';
import enabled from './enabled';
import modelCreate from './modelCreate';
import modelUpdate from './modelUpdate';
import externalSet from './externalSet';
import clear from './clear';
import migration from './$migration_20350101000000_goal_core';

const base = { agentId:'a', goalId:'old', schemaVersion:1, revision:2, objective:'goal', status:'active', tokenBudget:100, tokensUsed:100, timeUsedSeconds:9, createdAt:1, updatedAt:2 } as types.goal.State;
const apply = (current: types.goal.State|null, command:types.goal.Command, extra={}) => transition({} as Context,null,{current,command,expectedGoalId:current?.goalId??null,expectedRevision:current?.revision??null,agentId:'a',newGoalId:'new',now:5,maxTokenBudget:null,...extra});

describe('pure Codex core',()=>{
 for(const status of ['active','paused','blocked','usage_limited','budget_limited'] as const) test(`create rejects ${status}`,async()=>{await expect(apply({...base,status},{kind:'create',objective:'replacement'})).rejects.toThrow('unfinished');});
 test('replacement resets usage and identity only for complete',async()=>{expect(await apply({...base,status:'complete'},{kind:'create',objective:'new'})).toMatchObject({goalId:'new',revision:1,tokensUsed:0,timeUsedSeconds:0,createdAt:5});});
 for(const status of ['paused','blocked'] as const) test(`budget priority over ${status}`,async()=>{expect((await apply({...base,status:'budget_limited'},{kind:'update',status}))!.status).toBe('budget_limited');});
 test('complete overrides budget',async()=>{expect((await apply({...base,status:'budget_limited'},{kind:'update',status:'complete'}))!.status).toBe('complete');});
 test('resume cannot reset exhausted cap',async()=>{expect((await apply({...base,status:'paused'},{kind:'set',status:'active'}))!.status).toBe('budget_limited');});
 test('external edit preserves identity usage timestamps and status',async()=>{expect(await apply({...base,status:'blocked'},{kind:'set',objective:'edited'})).toMatchObject({goalId:'old',tokensUsed:100,timeUsedSeconds:9,createdAt:1,status:'blocked',revision:3});});
 test('external raised/null budget and explicit resume',async()=>{for(const tokenBudget of [200,null]) expect(await apply({...base,status:'budget_limited'},{kind:'set',tokenBudget,status:'active'})).toMatchObject({tokensUsed:100,tokenBudget,status:'active'});});
 test('model inherited and oversized host cap',async()=>{expect((await apply(null,{kind:'create',objective:'x'},{maxTokenBudget:50}))!.tokenBudget).toBe(50);await expect(apply(null,{kind:'create',objective:'x',tokenBudget:51},{maxTokenBudget:50})).rejects.toThrow('cap');});
 test('external not constrained by model cap',async()=>{expect((await apply(null,{kind:'set',objective:'x',tokenBudget:100},{maxTokenBudget:50}))!.tokenBudget).toBe(100);});
 test('Unicode boundary and blank objective',async()=>{expect((await apply(null,{kind:'create',objective:'😀'.repeat(4000)}))!.objective.length).toBe(8000);await expect(apply(null,{kind:'create',objective:'😀'.repeat(4001)})).rejects.toThrow('4000');await expect(apply(null,{kind:'set',objective:'  '})).rejects.toThrow('nonempty');});
 test('budget validation rejects invalid numbers',async()=>{for(const tokenBudget of [0,-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1])await expect(apply(null,{kind:'create',objective:'x',tokenBudget})).rejects.toThrow('budget');});
 test('CAS revision and identity guard clear/recreate ABA',async()=>{await expect(apply(base,{kind:'clear'},{expectedRevision:1})).rejects.toThrow('conflict');await expect(apply({...base,goalId:'recreated'},{kind:'clear'} ,{expectedGoalId:'old'})).rejects.toThrow('conflict');await expect(apply(null,{kind:'clear'},{expectedGoalId:'old',expectedRevision:2})).rejects.toThrow('conflict');expect(await apply(null,{kind:'clear'})).toBeNull();});
 test('model cannot resume or set system limit',async()=>{for(const status of ['active','usage_limited','budget_limited'])await expect(apply(base,{kind:'update',status} as types.goal.Command)).rejects.toThrow('model update');});
 test('input snapshot is immutable',async()=>{const before=structuredClone(base);await apply(base,{kind:'set',objective:'edited'});expect(base).toEqual(before);});
});

function fixture(on=true) {
 let goal:types.goal.State|null=null;
 let owner={id:'a',run_token:'run',run_state:'running',archived_at:null as number|null};
 let audit:unknown[][]=[]; let failAudit=false; const queries:string[]=[]; const legacy={statement:'legacy'};
 const ctx={state:{procs:{db:{transactionStorage:{getStore:()=>({active:true})}}}},fns:{goal:{},settings:{get:async()=>on},procs:{db:{
 transaction:async({fn}:any)=>{const old=structuredClone(goal),events=[...audit];try{return await fn();}catch(e){goal=old;audit=events;throw e;}},
 select:async({sql}:any)=>{queries.push(sql);if(sql.includes('FROM agents'))return [owner];if(sql.includes('FROM agent_goals'))return goal?[structuredClone(goal)]:[];throw Error(sql);},
 run:async({sql,params:p}:any)=>{queries.push(sql);if(sql.startsWith('INSERT INTO agent_goals')){goal={agentId:p[0],goalId:p[1],schemaVersion:p[2],revision:p[3],objective:p[4],status:p[5],tokenBudget:p[6],tokensUsed:p[7],timeUsedSeconds:p[8],createdAt:p[9],updatedAt:p[10]};}else if(sql.startsWith('DELETE'))goal=null;else if(sql.includes('goal_transition_events')){if(failAudit)throw Error('audit failure');audit.push(p);}else throw Error(sql);return {changes:1};}
 }}}} as any;
 for(const [name,fn] of Object.entries({enabled,read,transition,persist,persistTx,modelCreate,modelUpdate,externalSet,clear}))ctx.fns.goal[name]=(opts:any)=>fn(ctx,null,opts as never);
 return {ctx,queries,legacy,get goal(){return goal;},get audit(){return audit;},owner,setFail:()=>{failAudit=true;}};
}
const absent={agentId:'a',expectedGoalId:null,expectedRevision:null};
describe('isolated mock persistence (no database)',()=>{
 test('disabled is not absent and performs no goal SQL',async()=>{const f=fixture(false);expect(await f.ctx.fns.goal.read({agentId:'a'})).toEqual({enabled:false});await expect(f.ctx.fns.goal.clear(absent)).rejects.toThrow('disabled');expect(f.queries).toEqual([]);});
 test('create read set clear audit and legacy isolation',async()=>{const f=fixture();const g=await f.ctx.fns.goal.modelCreate({...absent,objective:'x',runToken:'run',maxTokenBudget:100});expect(f.queries[0]).toContain('FOR UPDATE');expect((await f.ctx.fns.goal.read({agentId:'a'})).goal).toEqual(g);const edited=await f.ctx.fns.goal.externalSet({agentId:'a',expectedGoalId:g.goalId,expectedRevision:g.revision,objective:'edited'});f.legacy.statement='stale session save';expect(f.goal!.objective).toBe('edited');await f.ctx.fns.goal.clear({agentId:'a',expectedGoalId:edited.goalId,expectedRevision:edited.revision});expect(f.goal).toBeNull();expect(f.audit).toHaveLength(3);expect(f.queries.some(q=>q.includes('UPDATE agents'))).toBe(false);});
 test('stale run, stop-first, archived reject before goal access',async()=>{for(const mode of ['stale','stop','archive']){const f=fixture();if(mode==='stop'){f.owner.run_state='idle';f.owner.run_token='';}if(mode==='archive')f.owner.archived_at=1;await expect(f.ctx.fns.goal.modelCreate({...absent,objective:'x',maxTokenBudget:null,runToken:mode==='stale'?'old':'run'})).rejects.toThrow('run');expect(f.goal).toBeNull();expect(f.queries).toHaveLength(1);}});
 test('audit failure rolls back goal',async()=>{const f=fixture();f.setFail();await expect(f.ctx.fns.goal.externalSet({...absent,objective:'x'})).rejects.toThrow('audit');expect(f.goal).toBeNull();});
 test('revision conflicts produce no extra audit',async()=>{const f=fixture();const g=await f.ctx.fns.goal.externalSet({...absent,objective:'x'});await expect(f.ctx.fns.goal.clear({...absent,expectedGoalId:g.goalId,expectedRevision:0})).rejects.toThrow('conflict');expect(f.audit).toHaveLength(1);});
 test('migration definition captures legacy atomically without importing/running',async()=>{let sql='';let scoped=false;const ctx={fns:{procs:{db:{transaction:async({fn}:any)=>{scoped=true;await fn();scoped=false;},exec:async(o:any)=>{expect(scoped).toBe(true);sql=o.sql;}}}}} as any;await migration.up(ctx);expect(sql).toContain('SELECT id,goal,');expect(sql).not.toContain('INSERT INTO agent_goals');expect(sql).not.toContain('UPDATE agents');expect(sql).not.toContain('next_run_at');});
});
