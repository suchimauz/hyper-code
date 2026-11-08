import {test,expect} from 'bun:test';
import authorize from './requestAuthorize';
import anthropic from '../llm/streamAnthropic';
import openai from '../llm/streamOpenAI';
import codex from '../llm/streamCodex';
import xai from '../llm/streamXai';
import gemini from '../llm/streamGemini';
import generate from '../llm/geminiGenerate';
const authority={rootAgentId:'root',goalId:'goal',sourceAgentId:'child',sourceRunId:'claim',capabilityId:'cap',authorizedThroughIdx:7,allowContinuation:false};
test('ordinary dispatch has no feature or SQL calls',async()=>{await authorize({fns:{}} as any,null,{});});
test('guard fails closed disabled, invalid frontier and durable denial; one read-only snapshot',async()=>{
 for(const variant of ['disabled','frontier','denied','allowed']){
 let calls=0;
 const ctx:any={goalRequestContext:{agentId:'child',authority:{...authority,...(variant==='frontier'?{authorizedThroughIdx:undefined}:{})}},fns:{goal:{enabled:async()=>variant!=='disabled'},procs:{db:{select:async(o:any)=>{calls++;expect(o.sql).toContain('WITH RECURSIVE');expect(o.sql).not.toContain('FOR UPDATE');expect(o.params).toEqual(['cap','root','goal','child','claim',7]);return [{allowed:variant==='allowed'}];}}}}};
 if(variant==='allowed') await authorize(ctx,null,{}); else await expect(authorize(ctx,null,{})).rejects.toMatchObject({goalRequestDenied:true});
 expect(calls).toBe(variant==='disabled'||variant==='frontier'?0:1);
 }
});
for(const [name,adapter] of Object.entries({anthropic,openai,codex,xai,gemini})) test(`${name}: rebuilt request denied before actual transport`,async()=>{
 let built=0,checks=0,fetches=0;
 const ep={provider:name==='gemini'?'opencode':name==='xai'||name==='codex'?'hyper':'test',upstream:'xai',apiKey:'test',modelId:'model',url:name==='gemini'?'https://opencode.ai/inference/google/v1beta/models/model:generateContent':'https://example.invalid'};
 const ctx:any={goalRequestContext:{agentId:'child',authority},state:{},env:{},fns:{agent:{buildLlmRequest:async()=>{built++;return {system:'s',messages:[]};},wireTools:()=>[],cacheRoot:async()=> 'root'},goal:{requestAuthorize:async()=>{checks++;throw Object.assign(Error('denied'),{goalRequestDenied:true});}},llm:{resolveEndpoint:async()=>ep,resolveReasoningEffort:async()=>({applied:'off'}),toAnthropicMessages:()=>[],toOpenAIMessages:()=>[],toCodexInput:()=>({input:[]}),toGeminiContents:async()=>[],geminiGenerationConfig:async()=>({}),accountAuthHealth:async()=>[],codexCliVersion:async()=> '0',connectFetch:async()=>{fetches++;throw Error('network forbidden');},opencodeFetch:async()=>{fetches++;throw Error('network forbidden');}}}};
 ctx.fns.llm.geminiGenerate=(o:any)=>generate(ctx,null,o);
 await expect(adapter(ctx,null,{agent:{id:'child',model:'test:model'} as any})).rejects.toMatchObject({goalRequestDenied:true});
 expect(built).toBe(1);expect(checks).toBe(1);expect(fetches).toBe(0);
});

test('Codex reauthorizes retry outside transport catch',async()=>{
 let checks=0,fetches=0;
 const ctx:any={goalRequestContext:{agentId:'child',authority},fns:{agent:{buildLlmRequest:async()=>({system:'',messages:[]}),cacheRoot:async()=> 'root',wireTools:()=>[]},goal:{requestAuthorize:async()=>{if(++checks===2) throw Object.assign(Error('revoked'),{goalRequestDenied:true});}},llm:{resolveEndpoint:async()=>({provider:'hyper',apiKey:'test',modelId:'test',url:'https://example.invalid'}),resolveReasoningEffort:async()=>({applied:'off'}),toCodexInput:()=>({input:[]}),codexCliVersion:async()=> '0',connectFetch:async()=>{fetches++;throw Error('temporary transport failure');}}}};
 await expect(codex(ctx,null,{agent:{id:'child',model:'test:model'} as any})).rejects.toMatchObject({goalRequestDenied:true});
 expect(checks).toBe(2);expect(fetches).toBe(1);
});
