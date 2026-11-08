import { describe, expect, test } from 'bun:test';
import normalize from './usageNormalize';
import accumulate from './usageAccumulate';

// No framework preload, network, database, module mocking, or live agent/goal.
const ctx = {} as Context;
const binding = { provider:'openai', requestId:'r1', sourceAgentId:'source', runId:'run', rootAccountingAgentId:'root', goalIdAtBoundary:'goal' };
const raw = { prompt_tokens:100, prompt_tokens_details:{cached_tokens:80}, completion_tokens:20 };
const norm = (usage:unknown=raw, extra:Partial<typeof binding>={}) => normalize(ctx,null,{binding:{...binding,...extra},format:'openai-chat',usage});
const add = (usage:types.goal.UsageNormalized,state?:types.goal.UsageAccumulator) => accumulate(ctx,null,{usage,state});

describe('goal usage evidence normalization',()=>{
 test('raw chat input already inclusive, zero is exact only when explicit',async()=>{
  expect(await norm()).toMatchObject({quality:'exact',inputTokens:'100',cachedInputTokens:'80',outputTokens:'20'});
  expect(await norm({prompt_tokens:0,prompt_tokens_details:{cached_tokens:0},completion_tokens:0})).toMatchObject({quality:'exact',inputTokens:'0',cachedInputTokens:'0',outputTokens:'0'});
 });
 test('missing counts never become exact zero',async()=>{
  for(const value of [undefined,null,{}, {prompt_tokens:10,completion_tokens:2},{prompt_tokens:10,prompt_tokens_details:{cached_tokens:0}}])
   expect(await normalize(ctx,null,{binding,format:'openai-chat',usage:value})).toMatchObject({quality:'unknown',inputTokens:null,cachedInputTokens:null,outputTokens:null});
 });
 test('invalid and unsafe integer evidence is unknown',async()=>{
  for(const value of [-1,1.2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'9223372036854775808','-1','01'])
   expect((await norm({...raw,prompt_tokens:value})).quality).toBe('unknown');
  expect((await norm({...raw,prompt_tokens:70})).quality).toBe('unknown');
 });
 test('raw Responses and Anthropic semantics are explicit',async()=>{
  expect(await normalize(ctx,null,{binding,format:'openai-responses',usage:{input_tokens:100,input_tokens_details:{cached_tokens:80},output_tokens:20}})).toMatchObject({quality:'exact',inputTokens:'100'});
  expect(await normalize(ctx,null,{binding,format:'anthropic-raw',usage:{input_tokens:10,cache_read_input_tokens:80,cache_creation_input_tokens:10,output_tokens:20}})).toMatchObject({quality:'exact',inputTokens:'100',cachedInputTokens:'80'});
  expect((await normalize(ctx,null,{binding,format:'anthropic-raw',usage:{input_tokens:10,cache_read_input_tokens:0,output_tokens:20}})).quality).toBe('unknown');
 });
 test('transformed provider streams never masquerade as exact',async()=>{
  for(const format of ['unsupported','hyper-stream-anthropic'] as const)
   expect(await normalize(ctx,null,{binding,format,usage:{prompt_tokens:0,cache_read_tokens:0,completion_tokens:0}})).toMatchObject({quality:'unsupported',inputTokens:null});
 });
 test('binding copied and frozen, no implicit goal identity',async()=>{
  const b={...binding};const result=await normalize(ctx,null,{binding:b,format:'openai-chat',usage:raw});b.requestId='changed';
  expect(result.requestId).toBe('r1');expect(Object.isFrozen(result)).toBe(true);
  expect((await norm(raw,{goalIdAtBoundary:null as never})).goalIdAtBoundary).toBeNull();
  await expect(norm(raw,{goalIdAtBoundary:undefined})).rejects.toThrow('Explicit goal');
 });
});
describe('pure immutable usage accumulator',()=>{
 test('deduplicates request IDs and sums decimal strings',async()=>{
  const first=await norm();const state=await add(first);
  expect(await add(first,state)).toBe(state);
  const next=await add(await norm(raw,{requestId:'r2'}),state);
  expect(next).toMatchObject({quality:'exact',inputTokens:'200',cachedInputTokens:'160',outputTokens:'40'});
  expect(state.inputTokens).toBe('100');expect(Object.isFrozen(next.requests)).toBe(true);expect(Object.isFrozen(next.requests.r2)).toBe(true);
 });
 test('rejects conflicting replay and all source/goal rebindings',async()=>{
  const state=await add(await norm());
  await expect(add(await norm({...raw,completion_tokens:21}),state)).rejects.toThrow('Conflicting');
  for(const key of ['sourceAgentId','runId','rootAccountingAgentId','goalIdAtBoundary'] as const)
   await expect(add(await norm(raw,{[key]:'changed',requestId:'r2'}),state)).rejects.toThrow('binding changed');
 });
 test('unknown and unsupported quality sticky; snapshots expose no partial total',async()=>{
  for(const format of ['openai-chat','unsupported'] as const){
   const missing=await normalize(ctx,null,{binding,format,usage:{}});
   const incomplete=await add(missing);expect(await add(missing,incomplete)).toBe(incomplete);
   const after=await add(await norm(raw,{requestId:'r2'}),incomplete);
   expect(after.quality).toBe(missing.quality);expect(after.inputTokens).toBeNull();expect(after.cachedInputTokens).toBeNull();expect(after.outputTokens).toBeNull();
   await expect(add(await norm(),incomplete)).rejects.toThrow('Conflicting');
  }
 });
 test('full i64 exact, overflow marks unknown rather than lying about saturation',async()=>{
  const large=await norm({...raw,prompt_tokens:'9223372036854775807'});const state=await add(large);
  expect(state.inputTokens).toBe('9223372036854775807');
  expect(await add(await norm(raw,{requestId:'next'}),state)).toMatchObject({quality:'unknown',inputTokens:null,cachedInputTokens:null,outputTokens:null});
 });
 test('request dictionary safely handles prototype names',async()=>{
  const state=await add(await norm(raw,{requestId:'__proto__'}));
  expect(Object.keys(state.requests)).toEqual(['__proto__']);expect(state.inputTokens).toBe('100');
  expect(await add(await norm(raw,{requestId:'__proto__'}),state)).toBe(state);
 });
});
