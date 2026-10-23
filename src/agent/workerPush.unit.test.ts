import {test,expect,mock} from 'bun:test';
import worker from './workerLoop';
import record from '../webPush/recordFailure';
async function scenario(kind:string, retryCount=0, stale=false) {
 let claimed=false; let idle=false; let queued=false; let wake=false; let stamp=0; let lastError:string|null=null;
 let claimedToken:string|null=null;
 const sent=mock(async()=>{});
 const agent:any={id:'ab',currentJobId:null};
 const ctx:any={state:{agent:{ab:agent},agentRunRetries:{ab:retryCount}},fns:{}};
 const finish=()=>{ctx.state.workerLoopRunning=false;ctx.state.workerWakePending=true;};
 const select=async({sql,params}:any)=>{
 if(sql.startsWith('WITH stale')){if(!stale)return [];idle=true;lastError='stale run recovered; automatic retry limit reached';stamp=params[4];queued=kind==='stale-retry';finish();return [{id:'ab',failed_token:'old-run',next_run_at:queued?1:null}];}
 if(sql.includes('RETURNING id')&&sql.includes("run_state       = 'running'")){if(claimed||stale)return [];claimed=true;claimedToken=params[2];return [{id:'ab'}];}
 if(sql.startsWith('SELECT run_token, run_state, stopped_at'))return [{run_token:ctx.state.agent.ab.currentJobId ?? claimedToken,run_state:'running',stopped_at:null}];
 if(sql.startsWith('SELECT COALESCE(MAX'))return [{max_idx:0}];
 if(sql.startsWith('INSERT INTO web_push_failures'))return idle&&!queued&&!wake&&lastError&&stamp===params[3]?[{agent_id:'ab'}]:[];
 if(sql.startsWith('SELECT LEAST')){finish();return [{next:Date.now()}];}
 return [];
 };
 const run=async({sql,params}:any)=>{
 if(sql.includes('RETURNING next_run_at')){
 idle=true;stamp=params[8];lastError=params[6];queued=kind==='concurrent-post'||params[5]!=null;
 if(kind==='lost-token')return {changes:0,rows:[]};
 return {changes:1,rows:[{next_run_at:queued?1:null}]};
 }
 if(sql.startsWith('UPDATE agents SET next_run_at'))queued=true;
 return {changes:1,rows:[]};
 };
 const noop=async()=>{};
 ctx.fns={events:{emitAgentsChanged:noop},procs:{env:{mode:()=> 'test'},db:{select,run},log:{warn:noop}},settings:{getNumber:async()=>0},session:{syncAgentState:noop,appendErrorEvent:noop},agent:{
 recoverOrphanedCompactions:noop,deliverWakes:noop,pollWatches:noop,pollTriggers:noop,wakeWorker:()=>{ctx.state.workerWakePending=true;},autoCompactIfNeeded:noop,
 parkOnUsageLimit:async()=>{if(kind==='park-failed')throw new Error('test park failure');wake=true;},run:async()=>{
 if(kind==='success')return {};
 if(kind==='abort')throw new DOMException('aborted','AbortError');
 const e:any=new Error('fixed test failure');e.failure={kind:['usage_limit','park-failed'].includes(kind)?'usage_limit':kind==='transient'?'transient':'fatal',retryable:kind==='transient',message:'fixed test failure'};throw e;
 }},webPush:{notifyError:sent,recordFailure:(o:any)=>record(ctx,null,o)}};
 await worker(ctx,null,{});return sent;
}
for(const kind of ['success','abort','lost-token','concurrent-post','usage_limit','transient'])test(`worker suppresses terminal push for ${kind}`,async()=>{expect(await scenario(kind)).not.toHaveBeenCalled();});
test('worker sends for fatal owned finalization',async()=>{expect(await scenario('fatal')).toHaveBeenCalledTimes(1);});
test('worker sends only after transient retry budget exhausted',async()=>{expect(await scenario('transient',1)).toHaveBeenCalledTimes(1);});
test('worker stale exhaustion sends using revoked durable token',async()=>{expect(await scenario('fatal',0,true)).toHaveBeenCalledWith({agentId:'ab',runToken:'old-run'});});

test('worker stale retry is not terminal',async()=>{expect(await scenario('stale-retry',0,true)).not.toHaveBeenCalled();});
test('worker failed quota parking with no durable wake is terminal',async()=>{expect(await scenario('park-failed')).toHaveBeenCalledTimes(1);});
