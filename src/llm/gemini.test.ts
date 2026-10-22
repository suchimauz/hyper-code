import {describe, expect, test} from 'bun:test';
import convert from './toGeminiContents';
import config from './geminiGenerationConfig';
import generate from './geminiGenerate';
import call from './callGemini';
import stream from './streamGemini';

function fixture(payload:any, options:{stream?:boolean; raw?:string; go?:boolean; status?:number}={}) {
 const requests:any[]=[];
 const ep={provider:'opencode',modelId:'gemini-fixture',url:`https://opencode.ai/inference/${options.go?'go/':''}google/v1beta/models/gemini-fixture:generateContent`};
 const ctx:any={fns:{llm:{resolveEndpoint:async()=>ep,opencodeCatalog:async()=>({models:[]}),opencodeFetch:async(o:any)=>{requests.push(o);return new Response(options.raw ?? (options.stream ? payload.map((p:any)=>'data: '+JSON.stringify(p)+'\n\n').join('') : JSON.stringify(payload)),{status:options.status ?? 200,headers:{'content-type':options.stream?'text/event-stream':'application/json'}});},parseSSE:async function*({body}:any){const raw=await new Response(body).text();for(const frame of raw.split('\n\n')){if(frame.startsWith('data: '))yield {data:frame.slice(6)};}}},agent:{}}};
 ctx.fns.llm.toGeminiContents=(o:any)=>convert(ctx,null,o);
 ctx.fns.llm.geminiGenerationConfig=(o:any)=>config(ctx,null,o);
 ctx.fns.llm.geminiGenerate=(o:any)=>generate(ctx,null,o);
 return {ctx,requests,ep};
}
const model='opencode:gemini-fixture';
const complete={candidates:[{index:0,content:{parts:[{text:'Hello'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:4,candidatesTokenCount:2,totalTokenCount:8,thoughtsTokenCount:2},modelVersion:'reported'};
describe('native Gemini fixture-only adapters',()=>{
 test('nonstream body, generation config, normalized metadata and Go session',async()=>{
  const {ctx,requests}=fixture(complete,{go:true});
  const r=await call(ctx,null,{model,user:'Hi',system:'System',max_tokens:100,temperature:0.2,sessionId:'stable',response_format:{type:'json_schema',json_schema:{schema:{type:'object'}}}});
  expect(r).toMatchObject({text:'Hello',thinking:'',toolCalls:[],finishReason:'STOP',requestedModel:'gemini-fixture',responseModel:'reported',usage:{prompt_tokens:4,completion_tokens:2,total_tokens:8}});
  expect(requests[0].sessionId).toBe('stable');
  expect(JSON.parse(requests[0].init.body)).toEqual({contents:[{role:'user',parts:[{text:'Hi'}]}],systemInstruction:{parts:[{text:'System'}]},generationConfig:{maxOutputTokens:100,temperature:0.2,responseMimeType:'application/json',responseJsonSchema:{type:'object'}}});
 });
 test('stream agent wires native tools and thought/text events',async()=>{
  const chunks=[{candidates:[{content:{parts:[{text:'Thinking',thought:true,thoughtSignature:'opaque-text'}]}}]},{candidates:[{content:{parts:[{text:'Answer'},{functionCall:{name:'eval',args:{code:'1'}},thoughtSignature:'opaque-call'}]},finishReason:'STOP'}]}];
  const {ctx,requests}=fixture(chunks,{stream:true,go:true});
  ctx.fns.agent.buildLlmRequest=async()=>({system:'s',messages:[{role:'user',content:'hi'}]});
  ctx.fns.agent.wireTools=()=>[{type:'function',function:{name:'eval',description:'Evaluate',parameters:{type:'object'},strict:true}}];
  const events:any[]=[];
  const r=await stream(ctx,null,{agent:{id:'ag',model} as any,onEvent:e=>events.push(e)});
  expect(requests[0].url).toEndWith(':streamGenerateContent?alt=sse');
  expect(requests[0].sessionId).toBe('ag');
  expect(JSON.parse(requests[0].init.body).tools).toEqual([{functionDeclarations:[{name:'eval',description:'Evaluate',parameters:{type:'object'}}]}]);
  expect(events).toEqual([{type:'thinking_delta',delta:'Thinking'},{type:'text_delta',delta:'Answer'}]);
  expect(r.toolCalls[0].thoughtSignature).toBe('opaque-call');
  const saved=JSON.parse(JSON.stringify(r.toolCalls));
  const history=await convert(ctx,null,{messages:[{role:'assistant',content:r.text,tool_calls:saved},{role:'tool',tool_call_id:saved[0].id,content:'result'}]});
  expect(history[0].parts).toEqual(chunks.flatMap(c=>c.candidates[0].content.parts));
  expect(history[1].parts).toEqual([{functionResponse:{name:'eval',response:{output:'result'}}}]);
 });
 test('multiple function calls preserve IDs, signatures and parallel responses',async()=>{
  const parts=[{functionCall:{id:'one',name:'a',args:{}},thoughtSignature:'s1'},{functionCall:{id:'two',name:'b',args:{x:1}},thoughtSignature:'s2'}];
  const {ctx}=fixture({candidates:[{content:{parts},finishReason:'STOP'}]});
  const r=await generate(ctx,null,{model,contents:[]});
  const history=await convert(ctx,null,{messages:[{role:'assistant',tool_calls:r.toolCalls},{role:'tool',tool_call_id:'one',content:'1'},{role:'tool',tool_call_id:'two',content:'2'}]});
  expect(history[0].parts).toEqual(parts);
  expect(history[1].parts.map(p=>p.functionResponse.id)).toEqual(['one','two']);
 });
 test('canonical images supported, unsupported document/remote image rejected',async()=>{
  const {ctx}=fixture(complete);
  const r=await convert(ctx,null,{messages:[{role:'user',content:[{type:'text',text:'hi'},{type:'image',mimeType:'image/png',data:'YWJj'},{type:'image_url',image_url:{url:'data:image/jpeg;base64,YWJj'}}]}]});
  expect(r[0].parts).toEqual([{text:'hi'},{inlineData:{mimeType:'image/png',data:'YWJj'}},{inlineData:{mimeType:'image/jpeg',data:'YWJj'}}]);
  for(const block of [{type:'document',fileName:'x.pdf'},{type:'image_url',image_url:{url:'https://example.org/x.png'}}])await expect(convert(ctx,null,{messages:[{role:'user',content:[block]}]})).rejects.toThrow('unsupported content block');
 });
 test('reasoning only exact advertised thinking levels, auto and effort ignored',async()=>{
  const {ctx}=fixture(complete);
  ctx.fns.llm.opencodeCatalog=async(o:any)=>{expect(o).toEqual({cachedOnly:true});return {models:[{id:'gemini-fixture',reasoningOptions:[{type:'effort',values:['high']}]}]};};
  expect(await config(ctx,null,{model,modelId:'gemini-fixture',reasoningEffort:'high'})).toEqual({});
  ctx.fns.llm.opencodeCatalog=async()=>({models:[{id:'gemini-fixture',reasoningOptions:[{type:'thinkingLevel',values:['high']}]}]});
  expect(await config(ctx,null,{model,modelId:'gemini-fixture',reasoningEffort:'high'})).toEqual({thinkingConfig:{thinkingLevel:'high'}});
  expect(await config(ctx,null,{model,modelId:'gemini-fixture',reasoningEffort:'auto'})).toEqual({});
  expect(await config(ctx,null,{model,modelId:'gemini-fixture',reasoningEffort:'low'})).toEqual({});
 });
 test('JSON response accepted for streaming request',async()=>{
  const {ctx}=fixture(complete);
  expect((await generate(ctx,null,{model,contents:[],stream:true})).text).toBe('Hello');
 });
 test('malformed, error, blocked, truncated and unsupported responses fail',async()=>{
  for(const payload of [{error:{message:'bad'}},{candidates:[]},{candidates:[{content:{parts:[{text:'partial'}]}}]},{promptFeedback:{blockReason:'SAFETY'}},{candidates:[{finishReason:'SAFETY'}]},{candidates:[{content:{parts:[{inlineData:{data:'bad'}}]},finishReason:'STOP'}]},{candidates:[{content:{parts:[{functionCall:{name:'x',args:'broken'}}]},finishReason:'STOP'}]}]) {
   const {ctx}=fixture(payload);await expect(generate(ctx,null,{model,contents:[]})).rejects.toThrow();
  }
  const {ctx}=fixture([],{stream:true,raw:'data: {invalid\n\n'});await expect(generate(ctx,null,{model,contents:[],stream:true})).rejects.toThrow('malformed SSE');
 });
 test('opaque signatures cannot be silently lost or transplanted',async()=>{
  const {ctx}=fixture(complete);
  await expect(convert(ctx,null,{messages:[{role:'assistant',tool_calls:[{id:'x',name:'a',args:{},thought_signature:'unknown'}]}]})).rejects.toThrow('foreign reasoning');
  await expect(convert(ctx,null,{messages:[{role:'assistant',tool_calls:[{id:'x',name:'b',args:{},geminiParts:[{functionCall:{name:'a',args:{}},thoughtSignature:'s'}]}]}]})).rejects.toThrow('do not match');
 });
 test('cancellation signal and errors forwarded without credentials',async()=>{
  const {ctx,requests}=fixture(complete);const c=new AbortController();c.abort();
  await expect(generate(ctx,null,{model,contents:[],signal:c.signal})).rejects.toThrow();
  expect(requests[0].init.signal).toBe(c.signal);
  const failed=fixture({}, {status:429});await expect(generate(failed.ctx,null,{model,contents:[]})).rejects.toThrow('429');
 });
});
