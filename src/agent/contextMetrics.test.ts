import { expect, test } from 'bun:test';
import details from './contextDetails';
import record from '../session/recordContextUsage';
import stream from '../llm/stream';

test('weighted decode TPS, cache ratio and partial history coverage', async () => {
 const rows = [
 {type:'context_usage',payload:JSON.stringify({usage:{prompt_tokens:100,completion_tokens:40,cache_read_tokens:80},metrics:{llmTimeMs:3000,ttftMs:1000}})},
 {type:'context_usage',payload:JSON.stringify({usage:{prompt_tokens:200,completion_tokens:60,cache_read_tokens:100},metrics:{llmTimeMs:4000,ttftMs:1000}})},
 {type:'context_usage',payload:JSON.stringify({usage:{prompt_tokens:10,completion_tokens:5}})},
 {type:'tool_call',payload:JSON.stringify({durationMs:250})},
 {type:'tool_call',payload:'{}'},
 ];
 const ctx:any={fns:{procs:{db:{select:async()=>rows}}}};
 const r=await details(ctx,null,{agentId:'x'});
 expect(r.session).toEqual({llmTimeMs:7000,toolTimeMs:250,avgTtftMs:1000,tokensPerSecond:20});
 expect(r.usage).toEqual({requests:3,inputTokens:310,outputTokens:105,cachedInputTokens:180,uncachedInputTokens:120,cacheHitRatio:0.6,cacheWriteTokens:0});
 expect(r.coverage).toEqual({requests:3,tokenRequests:3,timedRequests:2,ttftRequests:2,cacheRequests:2,tools:2,timedTools:1});
});
test('persists real zero cache and timing, absent cache remains unknown',async()=>{
 let saved:any;
 const ctx:any={fns:{session:{appendEvent:async(o:any)=>{saved=o.event;return {idx:1};}}}};
 await record(ctx,null,{id:'x',usage:{prompt_tokens:20,completion_tokens:3,prompt_tokens_details:{cached_tokens:0}},metrics:{llmTimeMs:100,ttftMs:20}});
 expect(saved.usage.cache_read_tokens).toBe(0); expect(saved.metrics.ttftMs).toBe(20);
 await record(ctx,null,{id:'x',usage:{prompt_tokens:20,completion_tokens:3}});
 expect(saved.usage.cache_read_tokens).toBeNull();expect(saved.metrics).toBeNull();
});
test('stream returns measured duration and first content timing without telemetry',async()=>{
 const ctx:any={fns:{procs:{},llm:{resolveEndpoint:async()=>({api:'mock'}),resolveReasoningEffort:async()=>({}),streamMock:async({onEvent}:any)=>{onEvent({type:'text_delta',delta:'ok'});return {text:'ok',usage:{prompt_tokens:1,completion_tokens:1}};}}}};
 const r=await stream(ctx,null,{agent:{model:'mock'} as any});
 expect(r.metrics.llmTimeMs).toBeGreaterThanOrEqual(0);expect(r.metrics.ttftMs).not.toBeNull();
});
