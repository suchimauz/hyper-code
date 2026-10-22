import {describe,test,expect} from 'bun:test';
import usage from './opencodeUsage';
import transport from './opencodeFetch';
import endpoint from './resolveEndpoint';
import instance from './codingInstance';

describe('OpenCode Console integration',()=>{
 test('monthly money is not quota and identities never escape',async()=>{
  const ctx:any={fns:{settings:{getString:async()=> 'payg'},llm:{opencodeFetch:async()=>Response.json([{email:'private@example.invalid',user_id:'private',spent_micro_cents:'150000000',limit_micro_cents:'1000000000',resets_at:'2030-01-01T00:00:00Z'}])}}};
  const result=await usage(ctx,null,{});expect(result).toEqual({available:true,spentUsd:1.5,limitUsd:10,resetsAt:Date.parse('2030-01-01T00:00:00Z')});expect(JSON.stringify(result)).not.toContain('private');
 });
 test('budget unavailable for ambiguous, malformed and forbidden responses',async()=>{
  for(const response of [Response.json([{},{}]),Response.json([{spent_micro_cents:'NaN',limit_micro_cents:null}]),new Response('',{status:403})]){
   expect((await usage({fns:{settings:{getString:async()=> 'payg'},llm:{opencodeFetch:async()=>response}}} as any,null,{})).available).toBe(false);
  }
 });
 test('unlimited budget is explicit null',async()=>{
  const result=await usage({fns:{settings:{getString:async()=> 'payg'},llm:{opencodeFetch:async()=>Response.json([{spent_micro_cents:'0',limit_micro_cents:null}])}}} as any,null,{});expect(result).toMatchObject({available:true,spentUsd:0,limitUsd:null});
 });
 test('transport refuses untrusted destinations before resolving token',async()=>{
  let read=false;const ctx:any={fns:{settings:{getString:async()=> 'payg'},secrets:{resolveSetting:async()=>{read=true;return 'test-only';}}}};
  for(const url of ['https://evil.invalid/inference/v1/models','http://opencode.ai/inference/v1/models','https://opencode.ai/inference/v1/models?q=1','https://opencode.ai/console/api/v1/billing'])await expect(transport(ctx,null,{url,init:{method:'GET'}})).rejects.toThrow('Unsupported');
  expect(read).toBe(false);
 });
 test('transport injects bearer only to allowlisted endpoint and prevents redirects',async()=>{
  let request:any;const ctx:any={fns:{secrets:{resolveSetting:async()=>'test-only'},settings:{getString:async()=>''},llm:{connectFetch:async(x:any)=>{request=x;return Response.json({data:[]});}}}};
  await transport(ctx,null,{url:'https://opencode.ai/inference/v1/models',init:{method:'GET'}});
  expect(request.init.redirect).toBe('error');expect(request.init.headers.get('authorization')).toBe('Bearer test-only');
 });
 test('catalogue controls protocol, key and trusted SSH route',async()=>{
  const ctx:any={fns:{settings:{getString:async()=> 'payg'},secrets:{resolveSetting:async()=>'test-only'},llm:{opencodeCatalog:async()=>({models:[{id:'opaque-model',api:'anthropic',baseUrl:'https://opencode.ai/inference/anthropic/v1'}]}),codingInstance:async()=>({instance:'remote'})},sshInstance:{list:async()=>[{name:'remote',pinnedHostKey:'pinned'}]}}};
  expect(await endpoint(ctx,null,{model:'opencode:opaque-model'})).toMatchObject({url:'https://opencode.ai/inference/anthropic/v1/messages',api:'anthropic',kind:'api',ssh:{instance:'remote',provider:'opencode',account:'default'}});
  await expect(endpoint(ctx,null,{model:'opencode:unknown'})).rejects.toThrow('unavailable');
  ctx.fns.sshInstance.list=async()=>[];await expect(endpoint(ctx,null,{model:'opencode:opaque-model'})).rejects.toThrow('trusted');
 });
 test('OpenCode instance setting does not alias MiniMax',async()=>{
  let key='';expect(await instance({fns:{settings:{getString:async(o:any)=>{key=o.key;return 'local';}}}} as any,null,{provider:'opencode'})).toEqual({instance:null});expect(key).toBe('opencodeInstance');
 });
});
