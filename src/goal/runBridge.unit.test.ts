import {test,expect} from 'bun:test';
import capture from './runBindingCapture';
import prepare from './runStopPrepare';
import record from './runUsageRecord';
import flush from './runCheckpointFlush';
import normalize from './usageNormalize';
import accumulate from './usageAccumulate';
const goal={goalId:'g',revision:1,status:'active',objective:'task'};
function fixture(enabled=true){
 const calls:any[]=[];
 const ctx:any={fns:{goal:{enabled:async()=>enabled,read:async()=>({enabled:true,goal:{...goal}}),usageNormalize:async(o:any)=>normalize(ctx,null,o),usageAccumulate:async(o:any)=>accumulate(ctx,null,o),accountingCheckpoint:async(o:any)=>{calls.push(o);return {revision:o.expectedRevision+1,status:'active',budgetTransition:false};}}}};
 return {ctx,calls};
}
async function bound(ctx:any){const r=await capture(ctx,null,{sourceAgentId:'a',runId:'r',runToken:'t',role:'normal'});if(r.kind!=='bound')throw Error(r.kind);return r.state;}
const usage={prompt_tokens:12,prompt_tokens_details:{cached_tokens:2},completion_tokens:3};
test('disabled capture never reads tables; sidecars excluded',async()=>{const {ctx}=fixture(false);ctx.fns.goal.read=()=>{throw Error('SQL forbidden')};expect((await capture(ctx,null,{sourceAgentId:'a',runId:'r',runToken:'t',role:'normal'})).kind).toBe('disabled');expect((await capture(ctx,null,{sourceAgentId:'a',runId:'r',runToken:'t',role:'goal-sidecar'})).kind).toBe('excluded');});
test('descendant without capability blocked',async()=>{const {ctx}=fixture();expect((await capture(ctx,null,{sourceAgentId:'child',rootAgentId:'a',runId:'r',runToken:'t',role:'normal'})).kind).toBe('blocked');});
test('usage and checkpoints serialize, preserve frozen token, exact dedup totals',async()=>{const {ctx,calls}=fixture();const state=await bound(ctx);expect(Object.isFrozen(state.binding)).toBe(true);await Promise.all([record(ctx,null,{state,provider:'openai',requestId:'q',format:'openai-chat',usage}),flush(ctx,null,{state}),record(ctx,null,{state,provider:'openai',requestId:'q',format:'openai-chat',usage}),flush(ctx,null,{state})]);expect(calls.map(c=>c.sequence)).toEqual([1,2]);expect(calls.map(c=>c.current)).toEqual([{input:'12',cached:'2',output:'3'},{input:'12',cached:'2',output:'3'}]);expect(calls[0].runToken).toBe('t');});
test('missing usage permits continuation with durable unknown evidence',async()=>{const {ctx,calls}=fixture();const state=await bound(ctx);expect((await record(ctx,null,{state,provider:'codex',requestId:'q',format:'common-stream',usage:undefined})).kind).toBe('recorded');expect((await flush(ctx,null,{state})).allowContinuation).toBe(true);expect(calls[0].quality).toBe('partial');expect(calls[0].usageEvidence.q.inputTokens).toBeNull();});
test('revision retry keeps identical snapshot and adopts revision',async()=>{const {ctx,calls}=fixture();const state=await bound(ctx);ctx.fns.goal.read=async()=>({enabled:true,goal:{...goal,revision:5}});ctx.fns.goal.accountingCheckpoint=async(o:any)=>{calls.push(o);if(calls.length===1)throw Error('Goal conflict: revision changed; reread and retry same immutable snapshot');return {revision:6,status:'budget_limited',budgetTransition:true};};const result=await flush(ctx,null,{state});expect(result).toMatchObject({kind:'committed',revision:6,budgetTransition:true,allowContinuation:false});expect(calls[0].current).toBe(calls[1].current);expect(calls[0].checkpointId).toBe(calls[1].checkpointId);expect(calls[0].nowMs).toBe(calls[1].nowMs);expect(calls[1].expectedRevision).toBe(5);});
test('changed objective or status blocks CAS retry',async()=>{for(const changed of [{objective:'different'},{status:'paused'},{goalId:'other'}]){const {ctx,calls}=fixture();const state=await bound(ctx);ctx.fns.goal.read=async()=>({enabled:true,goal:{...goal,...changed}});ctx.fns.goal.accountingCheckpoint=async(o:any)=>{calls.push(o);throw Error('Goal conflict: revision changed; reread and retry same immutable snapshot');};expect((await flush(ctx,null,{state})).kind).toBe('blocked');expect(calls.length).toBe(1);}});
test('revoked token is not retried, failure sticky',async()=>{const {ctx,calls}=fixture();const state=await bound(ctx);ctx.fns.goal.accountingCheckpoint=async(o:any)=>{calls.push(o);throw Error('Run token revoked');};expect((await flush(ctx,null,{state})).kind).toBe('blocked');await flush(ctx,null,{state});expect(calls.length).toBe(1);});
test('retry attempts bounded and feature off flush no ledger',async()=>{const {ctx,calls}=fixture();const state=await bound(ctx);ctx.fns.goal.accountingCheckpoint=async(o:any)=>{calls.push(o);throw Error('Goal conflict: revision changed; reread and retry same immutable snapshot');};expect((await flush(ctx,null,{state,maxAttempts:2})).kind).toBe('blocked');expect(calls.length).toBe(2);ctx.fns.goal.enabled=async()=>false;expect((await flush(ctx,null,{state})).kind).toBe('disabled');expect(calls.length).toBe(2);});
test('pending provider request blocks zero snapshot until its queued usage settles',async()=>{const {ctx,calls}=fixture();const state=await bound(ctx);state.pendingRequests.add('q');expect((await flush(ctx,null,{state})).kind).toBe('blocked');expect(calls.length).toBe(0);await record(ctx,null,{state,provider:'openai',requestId:'q',format:'openai-chat',usage});expect(state.pendingRequests.size).toBe(0);expect((await flush(ctx,null,{state})).kind).toBe('committed');});
test('sealed state rejects new usage and checkpoints synchronously without queue changes',async()=>{const {ctx,calls}=fixture();const state=await bound(ctx);state.sealed=true;const tail=state.tail;expect((await record(ctx,null,{state,provider:'openai',requestId:'q',format:'openai-chat',usage})).kind).toBe('blocked');expect((await flush(ctx,null,{state})).kind).toBe('blocked');expect(state.tail).toBe(tail);expect(calls.length).toBe(0);});
test('trusted descendant capture freezes authority, uses claim, blocks continuation and preserves Stop scope',async()=>{
 const {ctx,calls}=fixture();let active=false;
 ctx.state={};ctx.fns.procs={db:{transaction:async({fn}:any)=>{active=true;try{return await fn();}finally{active=false;}}}};
 ctx.fns.goal.delegationAuthorize=async(o:any)=>{expect(active).toBe(true);expect(o.sourceRunId).toBe('t');};
 const authority:any={rootAgentId:'a',goalId:'g',sourceAgentId:'child',sourceRunId:'t',capabilityId:'cap',allowContinuation:false};
 const r=await capture(ctx,null,{sourceAgentId:'child',runId:'lifecycle',runToken:'t',role:'normal',authority});
 expect(r.kind).toBe('bound');if(r.kind!=='bound')throw Error('capture blocked');
 const state=r.state;expect(state.binding.runId).toBe('t');expect(Object.isFrozen(state.binding.authority)).toBe(true);authority.capabilityId='tampered';
 expect((await flush(ctx,null,{state})).allowContinuation).toBe(false);expect(calls[0].authority.capabilityId).toBe('cap');expect(calls[0].runId).toBe('t');
 ctx.fns.goal.runStopRegistry=async()=>state;
 const ready=await prepare(ctx,null,{agentId:'child',runToken:'t'});expect(ready.kind).toBe('ready');if(ready.kind==='ready'){expect(ready.authority?.rootAgentId).toBe('a');expect(ready.snapshot.authority?.capabilityId).toBe('cap');}
 ctx.fns.goal.runStopRegistry=async()=>({...state,sealed:false,blocked:'unknown',tail:Promise.resolve()});
 const blocked=await prepare(ctx,null,{agentId:'child',runToken:'t'});expect(blocked.kind).toBe('blocked');if(blocked.kind==='blocked')expect(blocked.authority?.rootAgentId).toBe('a');
});
test('descendant capture mismatched scope and revoked capability fail closed',async()=>{
 const {ctx}=fixture();ctx.fns.procs={db:{transaction:async({fn}:any)=>fn()}};ctx.fns.goal.delegationAuthorize=async()=>{throw Error('revoked');};
 const authority:any={rootAgentId:'a',goalId:'g',sourceAgentId:'child',sourceRunId:'t',capabilityId:'cap',allowContinuation:false};
 for(const change of [{},{sourceRunId:'lifecycle'},{sourceAgentId:'other'}])expect((await capture(ctx,null,{sourceAgentId:'child',runId:'r',runToken:'t',role:'normal',authority:{...authority,...change}})).kind).toBe('blocked');
});

test('capture distinguishes confirmed inactivity from failed reads and missing authority',async()=>{
 const {ctx}=fixture();const opts:any={sourceAgentId:'a',runId:'r',runToken:'t',role:'normal'};
 for(const status of ['paused','complete','budget_limited']){
  ctx.fns.goal.read=async()=>({enabled:true,goal:{...goal,status}});
  expect(await capture(ctx,null,opts)).toEqual({kind:'inactive',goalId:'g',allowContinuation:false});
 }
 ctx.fns.goal.read=async()=>{throw Error('transient read failure')};
 expect((await capture(ctx,null,opts)).kind).toBe('blocked');
 expect((await capture(ctx,null,{...opts,runToken:''})).kind).toBe('blocked');
});

 test('all stream providers use reported counts and soft overshoot stops next continuation',async()=>{
 for(const provider of ['codex','anthropic','openai','xai','cursor','hyper','mock','gemini']) {
 const {ctx,calls}=fixture();const state=await bound(ctx);
 ctx.fns.goal.accountingCheckpoint=async(o:any)=>{calls.push(o);const exhausted=BigInt(o.current.input)+BigInt(o.current.output)>=10n;return {revision:2,status:exhausted?'budget_limited':'active',budgetTransition:exhausted};};
 await record(ctx,null,{state,provider,requestId:'q',format:'common-stream',usage:{prompt_tokens:100,completion_tokens:50}});
 expect((await flush(ctx,null,{state})).allowContinuation).toBe(false);
 expect(calls[0].current).toEqual({input:'100',cached:'0',output:'50'});
 expect(calls[0].usageEvidence.q.cachedInputTokens).toBeNull();
 }
 });
