import { expect, test } from 'bun:test';
import autoCompact from './autoCompactIfNeeded';

function fixture({ reported=140000, active=false, available=true }={}) {
 const controller=new AbortController();
 const agent:any={id:'fixture',model:'fixture:model',abortController:controller,activeRunCount:1,currentJobId:'owner'};
 let calls=0;
 const generation=active?{tailStart:2,activatedAt:1,model:agent.model,contextMessages:[{role:'assistant',content:'summary'}]}:null;
 const ctx:any={fns:{
  compaction:{resolve:()=>{if(!available)throw Error('unavailable');return {};},portable:({messages}:any)=>messages,contextWindow:()=>200000},
  procs:{db:{select:({sql}:any)=>sql.includes('FROM agents')?[{run_state:'running',run_token:'owner',sleep_context:generation}]:[{ts:2,payload:JSON.stringify({usage:{prompt_tokens:reported}})}]}},
  session:{getMessages:()=>[{role:'user',content:'task'},{role:'assistant',content:'response'}],appendEventWithHtml:()=>{}},
  agent:{normalizeSleepContext:({sleepContext}:any)=>sleepContext,getSleepGeneration:()=>generation,compactContext:()=>{calls++;return {status:'compacted'};}},
  settings:{getNumber:({key}:any)=>key==='autoCompactWindowPercent'?65:700000},
 }};
 return {agent,ctx,signal:controller.signal,calls:()=>calls};
}
test('owned request compacts at 65 percent and checkOnly never invokes summarizer',async()=>{
 const f=fixture();
 const result=await autoCompact(f.ctx,null,{agent:f.agent,signal:f.signal,runToken:'owner'});
 expect(result.status).toBe('compacted');expect(result.threshold).toBe(130000);expect(f.calls()).toBe(1);
 const measured=await autoCompact(f.ctx,null,{agent:f.agent,signal:f.signal,runToken:'owner',checkOnly:true});
 expect(measured.estimatedTokens).toBe(140000);expect(measured.contextWindow).toBe(200000);expect(f.calls()).toBe(1);
});
test('foreign ownership and cancellation never call summarizer',async()=>{
 const f=fixture();
 expect((await autoCompact(f.ctx,null,{agent:f.agent,signal:f.signal,runToken:'other'})).status).toBe('busy');
 f.agent.abortController.abort();
 expect((await autoCompact(f.ctx,null,{agent:f.agent,signal:f.signal,runToken:'owner'})).status).toBe('busy');expect(f.calls()).toBe(0);
});
test('unavailable compactor still reports budget for protective stop',async()=>{
 const f=fixture({reported:195000,available:false});
 const r=await autoCompact(f.ctx,null,{agent:f.agent,signal:f.signal,runToken:'owner',checkOnly:true});
 expect(r.status).toBe('no_compactor');expect(r.estimatedTokens).toBe(195000);expect(r.contextWindow).toBe(200000);expect(f.calls()).toBe(0);
});
test('recent checkpoint cannot hide an oversized budget',async()=>{
 const f=fixture({reported:195000,active:true});
 const r=await autoCompact(f.ctx,null,{agent:f.agent,signal:f.signal,runToken:'owner',checkOnly:true});
 expect(r.estimatedTokens).toBe(195000);expect(r.contextWindow).toBe(200000);expect(f.calls()).toBe(0);
});
