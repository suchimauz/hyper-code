import { expect, test } from 'bun:test';
import project from './project';
import portable from './portable';
import normalize from '../agent/normalizeSleepContext';
import generation from '../agent/getSleepGeneration';

function fixture(patch: any = {}) {
 const history: any[] = [{role:'user',content:'old'}, {role:'assistant',content:'answer'}, {role:'user',content:'tail'}];
 const checkpoint = [{role:'user',content:'summary'}];
 const gen = {revision:4,model:'codex:gpt',sourceOffset:2,tailStart:2,activatedAt:10,contextMessages:checkpoint,...patch};
 const sleep: any = {mode:'compact',activeRevision:4,generations:[gen]};
 const reads: string[] = [];
 const ctx: any = {fns:{agent:{normalizeSleepContext:(o:any)=>normalize(ctx,null,o),getSleepGeneration:(o:any)=>generation(ctx,null,o)},session:{getMessages:async({id}:any)=>{reads.push(id);return checkpoint;}},compaction:{portable:(o:any)=>portable(ctx,null,o)}}};
 return {ctx,history,checkpoint,gen,sleep,reads,call:()=>project(ctx,null,{model:'codex:gpt',messages:history,sleepContext:sleep})};
}
test('selected checkpoint and retained tail are read-only; child storage wins over inline checkpoint',async()=>{
 const f=fixture({contextAgentId:'selected',contextMessages:[{role:'user',content:'stale'}]});
 f.sleep.generations.push({revision:5,contextAgentId:'draft'});
 const before=structuredClone({history:f.history,sleep:f.sleep});
 expect(await f.call()).toEqual({messages:[...f.checkpoint,f.history[2]],mode:'compact',fallback:null,revision:4,tailStart:2,activatedAt:10});
 expect(f.reads).toEqual(['selected']);expect({history:f.history,sleep:f.sleep}).toEqual(before);
});
test('full mode never fetches a checkpoint',async()=>{
 const f=fixture({contextAgentId:'selected'});f.sleep.mode='full';
 const r=await f.call();expect(r.messages).toBe(f.history);expect(r.fallback).toBeNull();expect(f.reads).toEqual([]);
});
test('every fallback returns complete history, never a partial checkpoint',async()=>{
 for(const reason of ['missing_generation','missing_checkpoint','incompatible_checkpoint','invalid_boundary']) {
  const f=fixture();
  if(reason==='missing_generation')f.sleep.activeRevision=99;
  if(reason==='missing_checkpoint')f.gen.contextMessages=[];
  if(reason==='incompatible_checkpoint'){f.gen.model='codex:other';f.gen.contextMessages=[{role:'assistant',content:'opaque',message_type:'codex_compaction'}] as any;}
  if(reason==='invalid_boundary')f.gen.sourceOffset=99;
  const r=await f.call();expect(r.fallback).toBe(reason);expect(r.mode).toBe('full');expect(r.messages).toBe(f.history);expect(r.tailStart).toBeNull();expect(r.activatedAt).toBeNull();
 }
});
test('source and tail boundaries reject negative, fractional, missing and out of range offsets',async()=>{
 for(const patch of [{sourceOffset:-1},{tailStart:-1},{sourceOffset:1,tailStart:2},{sourceOffset:4},{sourceOffset:1.5},{tailStart:1.5},{sourceOffset:undefined},{tailStart:NaN}]) {
  expect((await fixture(patch).call()).fallback).toBe('invalid_boundary');
 }
 const f=fixture({sourceOffset:undefined,sourceFrontier:3,tailStart:1});
 expect((await f.call()).messages).toEqual([...f.checkpoint,...f.history.slice(1)]);
 expect((await fixture({sourceOffset:0,tailStart:0}).call()).mode).toBe('compact');
});
test('same upstream route preserves opaque checkpoint via real portable policy',async()=>{
 const native={role:'assistant',content:'opaque',message_type:'codex_compaction'};
 const f=fixture({model:'ssh:codex/work:gpt',contextMessages:[native]});
 expect((await f.call()).messages[0]).toBe(native);
 f.gen.model='codex:other';expect((await f.call()).fallback).toBe('incompatible_checkpoint');
});
