import { describe, expect, test } from 'bun:test';
import capabilities from './reasoningCapabilities';
import contextWindow from '../compaction/contextWindow';

const entry = {id:'claude-not-guessed',api:'anthropic',baseUrl:'https://opencode.ai/inference/anthropic/v1',context:987654,reasoning:{supported:['auto','low','high'],defaultEffort:'low',mode:'anthropic-adaptive'}};
function context(models: any[]) {
 const reads:any[]=[];
 const ctx = {fns:{llm:{opencodeCatalog:async (opts:any)=>{reads.push(opts);return {models,updatedAt:1}}},compaction:{modelIdentity:async ({model}:any)=>({provider:'opencode',modelId:model.split(':')[1]})}}} as any;
 return {ctx,reads};
}
describe('OpenCode cached capability consumers',()=>{
 test('uses exact metadata, no model-name effort guesses',async()=>{
  const {ctx,reads}=context([entry]);
  expect(await capabilities(ctx,null,{model:'opencode:claude-not-guessed'})).toEqual(entry.reasoning);
  expect(reads).toEqual([{cachedOnly:true}]);
 });
 test('unknown Claude and GPT routes fail closed',async()=>{
  const {ctx}=context([]);
  for(const id of ['claude-opus-5','gpt-6']) {
   expect((await capabilities(ctx,null,{model:`opencode:${id}`})).mode).toBe('none');
   expect(await contextWindow(ctx,null,{model:`opencode:${id}`})).toBeNull();
  }
 });
 test('context window uses cached exact-ID metadata',async()=>{
  const {ctx,reads}=context([entry]);
  expect(await contextWindow(ctx,null,{model:'opencode:claude-not-guessed'})).toBe(987654);
  expect(reads).toEqual([{cachedOnly:true}]);
 });
});
