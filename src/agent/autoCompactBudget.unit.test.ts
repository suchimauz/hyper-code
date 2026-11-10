import { expect, test } from 'bun:test';
import autoCompact from './autoCompactIfNeeded';
import estimateTokens from '../compaction/estimateTokens';
import project from '../compaction/project';
import contextTokens from './contextTokens';
// Dedicated usage with the coverage boundary recorded by agent.run.
const usage=(prompt:any,completion:any,ts:number,model='fixture:model',coveredIdx=1)=>({type:'context_usage',ts,payload:JSON.stringify({usage:{prompt_tokens:prompt,completion_tokens:completion},model,coveredIdx})});

function fixture({ reported=140000, active=false, available=true }={}) {
 const controller=new AbortController();
 const agent:any={id:'fixture',model:'fixture:model',abortController:controller,activeRunCount:1,currentJobId:'owner'};
 let calls=0;
 const generation=active?{mode:'compact',sourceOffset:2,tailStart:2,activatedAt:1,model:agent.model,contextMessages:[{role:'assistant',content:'summary'}]}:null;
 const events:any[]=[usage(reported,0,2)];
 const ctx:any={fns:{
  compaction:{tokenizer:async()=>null,calibration:async()=>({factor:1,samples:0,source:'heuristic'}),project:(opts:any)=>project(ctx,null,opts),estimateTokens:(opts:any)=>estimateTokens(ctx,null,opts),resolve:()=>{if(!available)throw Error('unavailable');return {};},portable:({messages}:any)=>messages,contextWindow:()=>200000},
  procs:{db:{select:({sql}:any)=>{if(sql.includes('FROM agents'))return [{run_state:'running',run_token:'owner',model:agent.model,sleep_context:generation}];expect(sql).toContain("type = 'context_usage'");expect(sql).toContain('LIMIT 1');return events.filter(e=>e.type==='context_usage').slice(-1);}}},
  session:{getMessages:()=>[{role:'user',content:'task',idx:0},{role:'assistant',content:'response',idx:1}],getFullMessages:(o:any)=>ctx.fns.session.getMessages(o),appendEventWithHtml:()=>{}},
  agent:{normalizeSleepContext:({sleepContext}:any)=>sleepContext,getSleepGeneration:()=>generation,compactContext:()=>{calls++;return {status:'compacted'};},contextTokens:(o:any)=>contextTokens(ctx,null,o)},
  settings:{getNumber:({key}:any)=>key==='autoCompactWindowPercent'?65:700000},
 }};
 return {agent,ctx,events,signal:controller.signal,calls:()=>calls};
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
test('tool-only usage drives checkOnly and threshold despite a later usage-less assistant',async()=>{
 const f=fixture({reported:1000});
 f.events.push(usage(135000,5000,3));
 f.events.push({type:'assistant',ts:4,payload:JSON.stringify({text:'done'})});
 const opts={agent:f.agent,signal:f.signal,runToken:'owner'};
 const measured=await autoCompact(f.ctx,null,{...opts,checkOnly:true});
 expect(measured.status).toBe('over_threshold');expect(measured.estimatedTokens).toBe(135000);expect(measured.source).toBe('provider');expect(f.calls()).toBe(0);
 expect((await autoCompact(f.ctx,null,opts)).status).toBe('compacted');expect(f.calls()).toBe(1);
});
test('usage before or at active compaction is discarded, newer tool usage counts',async()=>{
 for(const ts of [0,1]){
  const f=fixture({reported:195000,active:true});
  f.events.push(usage(195000,1000,ts));
  const opts={agent:f.agent,signal:f.signal,runToken:'owner',checkOnly:true};
  const measured=await autoCompact(f.ctx,null,opts);expect(measured.status).toBe('below_threshold');expect(measured.estimatedTokens).toBeLessThan(1000);
  f.events.push(usage(140000,1000,2));
  expect((await autoCompact(f.ctx,null,opts)).estimatedTokens).toBe(140000);expect(f.calls()).toBe(0);
 }
});
test('invalid dedicated usage cannot poison budget or revive legacy high usage',async()=>{
 const f=fixture({reported:195000});
 f.events.push(usage('bad',1,3));
 const measured=await autoCompact(f.ctx,null,{agent:f.agent,signal:f.signal,runToken:'owner',checkOnly:true});
 expect(measured.status).toBe('below_threshold');expect(Number.isFinite(measured.estimatedTokens)).toBe(true);expect(f.calls()).toBe(0);
});

test('per-agent override follows global changes after reset and drives real trigger',async()=>{
 const f=fixture();let global=80;
 f.ctx.fns.settings.getNumber=({key}:any)=>key==='autoCompactWindowPercent'?global:700000;
 const opts={agent:f.agent,signal:f.signal,runToken:'owner'};
 expect((await autoCompact(f.ctx,null,opts)).status).toBe('below_threshold');
 global=65;expect((await autoCompact(f.ctx,null,opts)).status).toBe('compacted');
 f.agent.autoCompactWindowPercent=85;global=30;
 expect((await autoCompact(f.ctx,null,opts)).threshold).toBe(170000);expect(f.calls()).toBe(1);
 f.agent.autoCompactWindowPercent=null;
 expect((await autoCompact(f.ctx,null,opts)).threshold).toBe(60000);expect(f.calls()).toBe(2);
 f.agent.model='other:model';f.agent.autoCompactWindowPercent=75;
 expect((await autoCompact(f.ctx,null,opts)).threshold).toBe(150000);
 f.ctx.fns.settings.getNumber=()=>100000;
 expect((await autoCompact(f.ctx,null,opts)).threshold).toBe(100000);
 expect((await autoCompact(f.ctx,null,{...opts,thresholdTokens:120000})).threshold).toBe(120000);
});

test('window threshold supports 15 percent and fractional lower overrides without changing the default',async()=>{
 for(const percent of [15,15.5,29]) {
  const f=fixture();f.agent.autoCompactWindowPercent=percent;
  const result=await autoCompact(f.ctx,null,{agent:f.agent,signal:f.signal,runToken:'owner',checkOnly:true});
  expect(result.threshold).toBe(Math.floor(200000*percent/100));
  f.agent.autoCompactWindowPercent=null;
  f.ctx.fns.settings.getNumber=({key}:any)=>key==='autoCompactWindowPercent'?percent:700000;
  expect((await autoCompact(f.ctx,null,{agent:f.agent,signal:f.signal,runToken:'owner',checkOnly:true})).threshold).toBe(Math.floor(200000*percent/100));
 }
 const f=fixture();f.agent.autoCompactWindowPercent=14.9;
 expect((await autoCompact(f.ctx,null,{agent:f.agent,signal:f.signal,runToken:'owner',checkOnly:true})).threshold).toBe(30000);
});


test('Raylane image-heavy retained context no longer falsely exceeds the hard stop budget',async()=>{
 const f=fixture({reported:27657,active:true});
 f.agent.autoCompactWindowPercent=70;
 f.ctx.fns.compaction.contextWindow=()=>272000;
 const images=Array.from({length:7},(_,i)=>({role:'tool',content:[{type:'text',text:`Screenshot ${i}`},{type:'image',mimeType:'image/png',data:'a'.repeat(i===6?345820:150000)}],idx:i}));
 f.ctx.fns.agent.getSleepGeneration=()=>({sourceOffset:0,tailStart:0,activatedAt:3,model:f.agent.model,contextMessages:[{role:'user',message_type:'codex_compaction',content:'x'.repeat(41000)}]});
 f.ctx.fns.session.getMessages=()=>images;
 // The provider count precedes the checkpoint, so this must also work when
 // only the fallback estimator is valid. No actual summary is performed.
 const opts={agent:f.agent,signal:f.signal,runToken:'owner',checkOnly:true};
 const result=await autoCompact(f.ctx,null,opts);
 expect(result.status).toBe('below_threshold');expect(result.threshold).toBe(190400);
 expect(result.estimatedTokens).toBeGreaterThan(28000);expect(result.estimatedTokens).toBeLessThan(45000);expect(f.calls()).toBe(0);
 // Vision-heavy provider usage is never capped to the image heuristic.
 f.events.push(usage(250000,500,4,'fixture:model',6));
 expect((await autoCompact(f.ctx,null,opts)).estimatedTokens).toBe(250000);
 expect((await autoCompact(f.ctx,null,opts)).status).toBe('over_threshold');
});

test('large ordinary tool text is still over budget and cannot be mistaken for an image',async()=>{
 const f=fixture({reported:1000});
 // Output persisted after the measured request is the delta added to provider usage.
 f.ctx.fns.session.getMessages=()=>[{role:'tool',content:'x'.repeat(800000),idx:5}];
 const result=await autoCompact(f.ctx,null,{agent:f.agent,signal:f.signal,runToken:'owner',checkOnly:true});
 expect(result.status).toBe('over_threshold');expect(result.estimatedTokens).toBeGreaterThanOrEqual(200000);
});

test('provider usage from another model or without coverage falls back to the local estimate',async()=>{
 for(const event of [usage(140000,0,3,'other:model'),{type:'context_usage',ts:3,payload:JSON.stringify({usage:{prompt_tokens:140000,completion_tokens:0}})}]){
  const f=fixture({reported:1000});f.events.push(event);
  const r=await autoCompact(f.ctx,null,{agent:f.agent,signal:f.signal,runToken:'owner',checkOnly:true});
  expect(r.source).toBe('estimate');expect(r.estimatedTokens).toBeLessThan(1000);expect(r.status).toBe('below_threshold');
 }
});
