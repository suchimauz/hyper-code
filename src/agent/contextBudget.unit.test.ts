import { expect, test } from 'bun:test';
import budget from './contextBudget';
import build from './buildLlmRequest';
import project from '../compaction/project';
import portable from '../compaction/portable';
import estimate from '../compaction/estimateTokens';
import normalize from './normalizeSleepContext';
import generation from './getSleepGeneration';

function fixture() {
 const messages:any[]=[{role:'user',content:'old '.repeat(300000)},{role:'user',content:'tail'}];
 const sleep:any={mode:'compact',activeRevision:1,generations:[{revision:1,model:'test:model',sourceOffset:1,tailStart:1,contextAgentId:'checkpoint',activatedAt:20}]};
 const agent:any={id:'root',model:'stale:model',messages:[{role:'user',content:'stale live history'}],sleepContext:null,scratchpad:{}};
 let checkpoint:any[]=[];
 let measured:any[]=[];
 const tools=[{name:'test',description:'schema '.repeat(100)}];
 const ctx:any={state:{agent:{root:agent}},fns:{
  planning:{prompt:async()=> 'Current mode: execute'},
  procs:{db:{select:async({sql}:any)=>sql.includes('FROM agents')?[{model:'test:model',sleep_context:sleep}]:[{payload:JSON.stringify({usage:{prompt_tokens:200000}}),ts:10}]},log:{warn:()=>{throw Error('preview must not log repair');}}},
  session:{getMessages:async({id}:any)=>id==='root'?messages:checkpoint,repairToolPairs:({messages}:any)=>({messages:structuredClone(messages),repaired:[]}),load:()=>{throw Error('unexpected load');}},
  agent:{contextTokens:async({fallbackTokens}:any)=>({tokens:fallbackTokens,source:'estimate',reportedTokens:null,deltaTokens:null,reportedAt:null}),normalizeSleepContext:(o:any)=>normalize(ctx,null,o),getSleepGeneration:(o:any)=>generation(ctx,null,o),fullSystemPrompt:async()=> 'bootstrap '.repeat(100),selectJevContext:async({messages,cachedOnly}:any)=>{expect(cachedOnly).toBe(true);return messages;},buildLlmRequest:(o:any)=>{expect(o.preview).toBe(true);expect(o.agent.model).toBe('test:model');return build(ctx,null,o);},wireTools:()=>tools},
  auth:{attributeMessages:async({messages}:any)=>({messages,applied:false})},
  attachments:{resolveContent:async({messages}:any)=>structuredClone(messages)},
  llm:{resolveEndpoint:async()=>({provider:'test',api:'test'}),call:()=>{throw Error('no generation');},stream:()=>{throw Error('no generation');}},
  compaction:{tokenizer:async()=>null,calibration:async()=>({factor:1,samples:0,source:'heuristic'}),project:(o:any)=>project(ctx,null,o),portable:(o:any)=>portable(ctx,null,o),estimateTokens:(o:any)=>{measured=o.messages;return estimate(ctx,null,o);},contextWindow:async()=>1000000},
 }};
 return {ctx,agent,messages,sleep,tools,setCheckpoint:(v:any[])=>{checkpoint=v;},measured:()=>measured,call:()=>budget(ctx,null,{agentId:'root'})};
}
test('missing checkpoint measures massive outgoing history rather than stale 200k usage',async()=>{
 const f=fixture();const before=structuredClone({agent:f.agent,messages:f.messages,sleep:f.sleep});
 const r=await f.call();expect(r.estimatedTokens).toBeGreaterThan(300000);expect(r.lastReportedTokens).toBe(200000);expect(r.lastReportedAt).toBe(10);expect(r.fallback).toBe('missing_checkpoint');expect(r.mode).toBe('full');expect(r.messageCount).toBe(5);
 expect({agent:f.agent,messages:f.messages,sleep:f.sleep}).toEqual(before);
 expect(f.measured().at(-1).content).toBe(JSON.stringify(f.tools));expect(f.measured()[0].content).toContain('bootstrap');
});
test('actual request uses the shared projection, full mode bypasses it without mutation',async()=>{
 const f=fixture();f.setCheckpoint([{role:'user',content:'summary'}]);
 const projected=await project(f.ctx,null,{model:'test:model',messages:f.messages,sleepContext:f.sleep});
 const request=await build(f.ctx,null,{agent:{...f.agent,model:'test:model',messages:f.messages,sleepContext:f.sleep},preview:true});
 expect(request.messages.slice(2,-1)).toEqual(projected.messages);
 expect(request.messages.at(-1)).toEqual({role:'user',content:'Current mode: execute',excluded_from_cursor:true});
 const compact=await f.call();expect(compact.mode).toBe('compact');expect(compact.fallback).toBeNull();expect(compact.estimatedTokens).toBeLessThan(2000);
 f.sleep.mode='full';const full=await f.call();expect(full.mode).toBe('full');expect(full.fallback).toBeNull();expect(full.estimatedTokens).toBeGreaterThan(300000);
});
test('materialized attachment images reserve vision tokens, not base64 text tokens',async()=>{
 const f=fixture();f.sleep.mode='full';f.messages.splice(0,f.messages.length,{role:'user',content:[{type:'image_ref',attachmentId:'image'}]});
 let bytes=100;
 f.ctx.fns.attachments.resolveContent=async({messages}:any)=>messages.map((m:any)=>Array.isArray(m.content)?{...m,content:[{type:'image',data:'a'.repeat(bytes),mimeType:'image/png'}]}:m);
 const before=structuredClone(f.messages);const small=await f.call();bytes=1000000;const large=await f.call();
 expect(large.estimatedTokens).toBe(small.estimatedTokens);expect(large.estimatedTokens).toBeGreaterThan(4096);expect(f.messages).toEqual(before);
});
test('provider total: calibrated breakdown is fitted to usedTokens and keeps proportions',async()=>{
 const f=fixture();f.sleep.mode='full';
 f.ctx.fns.compaction.calibration=async()=>({factor:2,samples:5,source:'heuristic'});
 const plain=await budget(f.ctx,null,{agentId:'root',breakdown:true});
 f.ctx.fns.agent.contextTokens=async()=>({tokens:100001,source:'provider',reportedTokens:100000,deltaTokens:1,reportedAt:10});
 const r=await budget(f.ctx,null,{agentId:'root',breakdown:true});
 const b=r.breakdown!;expect(r.usedSource).toBe('provider');expect(b.systemPrompt+b.toolDefinitions+b.messages).toBe(100001);
 const p=plain.breakdown!;expect(b.systemPrompt/b.messages).toBeCloseTo(p.systemPrompt/p.messages,2);
 expect(p.systemPrompt).toBeGreaterThan(0);
});
