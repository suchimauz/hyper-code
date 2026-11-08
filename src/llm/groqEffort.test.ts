import { test, expect } from 'bun:test';
import capabilities from './reasoningCapabilities';
import resolve from './resolveReasoningEffort';
import stream from './streamOpenAI';
test('Groq GPT-OSS supports bounded levels; unrelated models expose none', async()=>{
 for(const model of ['groq:openai/gpt-oss-20b','groq/account:openai/gpt-oss-120b']) expect((await capabilities({} as any,null,{model})).supported).toEqual(['auto','low','medium','high']);
 expect((await capabilities({} as any,null,{model:'groq:llama-3.3-70b-versatile'})).mode).toBe('none');
});
test('Groq chat sends explicit supported effort and omits auto',async()=>{
 for(const effort of ['auto','low','medium','high']) {
 let body:any;
 const ctx:any={fns:{agent:{buildLlmRequest:async()=>({system:'',messages:[]}),wireTools:()=>[]},llm:{
 resolveEndpoint:async()=>({provider:'groq',modelId:'openai/gpt-oss-20b',url:'http://mock.invalid'}),toOpenAIMessages:()=>[],
 reasoningCapabilities:(opts:any)=>capabilities(ctx,null,opts),resolveReasoningEffort:(opts:any)=>resolve(ctx,null,opts),
 connectFetch:async(opts:any)=>{body=JSON.parse(opts.init.body);return Response.json({choices:[{message:{content:'ok'},finish_reason:'stop'}]});}
 }}};
 await stream(ctx,null,{agent:{model:'groq:openai/gpt-oss-20b',reasoningEffort:effort} as any});
 expect(body.reasoning_effort).toBe(effort==='auto'?undefined:effort);
 }
});
