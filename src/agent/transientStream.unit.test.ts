import {test,expect} from 'bun:test';
import render from './renderTransientStream';
import route from './$route_$id_stream.html_GET';
import eventsRoute from './$route_$id_events.html_GET';
import live from '../ui/live';

function fixture(){
 const agent={id:'sample',scratchpad:{} as Record<string,any>};
 const ctx:any={state:{agent:{sample:agent}},fns:{ui:{},agent:{},procs:{ui:{escape:({text}:any)=>Bun.escapeHTML(String(text))},db:{select:async()=>[{id:'sample'}]}},session:{getMaxEventIdx:async()=>0,getEvents:async()=>[{idx:0,type:'assistant',text:'final answer'}]},auth:{markSeen:async()=>{}}}};
 ctx.fns.ui.live=(o:any)=>live(ctx,null,o);
 ctx.fns.agent.renderTransientStream=(o:any)=>render(ctx,null,o);
 ctx.fns.agent.renderEventsHtml=async({events}:any)=>events.map((e:any)=>Bun.escapeHTML(e.text)).join('');
 return {ctx,agent};
}
test('RAM-only fragment escapes partial prose, replaces one region and clears without durable writes',async()=>{
 const {ctx,agent}=fixture();
 agent.scratchpad.mobileStream={text:'<script>unsafe</script> partial',revision:1};
 for(let i=0;i<2;i++){
  const response=await route(ctx,null,{req:new Request('http://localhost/agent/sample/stream.html'),params:{id:'sample'}});
  const html=await response.text();
  expect(html.match(/id="msg-stream"/g)).toHaveLength(1);
  expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt; partial');
  expect(html).not.toContain('<script>');expect(html).toContain('role="status"');
  expect(html).toContain('data-live-topic="agent:sample:stream"');
  expect(response.headers.get('cache-control')).toBe('no-store');
 }
 delete agent.scratchpad.mobileStream;
 const empty=await render(ctx,null,{agentId:'sample'});
 expect(empty).toContain('id="msg-stream"');expect(empty).not.toContain('unsafe');expect(empty).not.toContain('aria-busy');
 expect((await route(ctx,null,{req:new Request('http://localhost/'),params:{id:'missing'}})).status).toBe(404);
});
test('durable tail clears transient bubble out of band, preserving cursor and history paging',async()=>{
 const {ctx}=fixture();
 const final=await (await eventsRoute(ctx,null,{req:new Request('http://localhost/agent/sample/events.html?offset=0'),params:{id:'sample'}})).text();
 expect(final).toContain('final answer');expect(final).toContain('offset=1');expect(final).toContain('hx-swap-oob="outerHTML"');expect(final.match(/id="msg-stream"/g)).toHaveLength(1);
 const history=await (await eventsRoute(ctx,null,{req:new Request('http://localhost/agent/sample/events.html?before=1'),params:{id:'sample'}})).text();
 expect(history).not.toContain('msg-stream');
 const column=await Bun.file(new URL('../ui/chatColumn.ts',import.meta.url)).text();
 expect(column.indexOf('await ctx.fns.agent.renderTransientStream')).toBeGreaterThan(column.indexOf('id="msg-tail"'));
});

async function extracted(){
 const source=await Bun.file(new URL('./run.ts',import.meta.url)).text();
 const start=source.indexOf('        const mobileStream =');
 const end=source.indexOf('        const { text, usage, finishReason',start);
 expect(start).toBeGreaterThan(0);expect(end).toBeGreaterThan(start);
 return new Function('ctx','agent','ac','setTimeout','clearTimeout',new Bun.Transpiler({loader:'ts'}).transformSync('return (async()=>{while(true){\n'+source.slice(start,end)+'\nbreak;}})();'));
}
for(const mode of ['success','error','abort'] as const)test('run coalesces 100 deltas and clears on '+mode,async()=>{
 const run=await extracted();const agent:any={id:'sample',scratchpad:{}};const ac=new AbortController();const notices:any[]=[];const timers=new Map<number,()=>void>();let timerId=0;
 const set=(fn:()=>void,ms:number)=>{expect(ms).toBe(350);timers.set(++timerId,fn);return timerId;};const clear=(id:number)=>timers.delete(id);
 const original=new Error('original stream failure');
 const ctx:any={fns:{procs:{events:{emit:(o:any)=>notices.push(o)}},llm:{stream:async(o:any)=>{
  for(let i=0;i<100;i++)o.onEvent({type:'text_delta',delta:'x'});
  expect(notices).toHaveLength(0);expect(timers.size).toBe(1);expect(agent.scratchpad.mobileStream.text).toHaveLength(100);
  const fn=[...timers.values()][0]!;timers.clear();fn();
  expect(notices).toHaveLength(1);expect(notices[0]).toEqual({topic:'agent:sample:stream',event:{type:'refresh'}});
  // Leave another pending notification; all completion paths must cancel it.
  o.onEvent({type:'text_delta',delta:'y'});expect(timers.size).toBe(1);
  if(mode==='abort'){
   ac.abort('test');expect(agent.scratchpad.mobileStream).toBeUndefined();expect(timers.size).toBe(0);
   o.onEvent({type:'text_delta',delta:'ignored'});expect(timers.size).toBe(0);
  }
  if(mode!=='success')throw original;
  return {text:'x'.repeat(100)+'y',toolCalls:[]};
 }}}};
 if(mode==='success')await run(ctx,agent,ac,set,clear);else await expect(run(ctx,agent,ac,set,clear)).rejects.toBe(original);
 expect(agent.scratchpad.mobileStream).toBeUndefined();expect(agent.samplingAbortController).toBeNull();expect(timers.size).toBe(0);
 expect(notices.length).toBeGreaterThanOrEqual(2);
});
