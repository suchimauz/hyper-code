import { expect, test } from 'bun:test';
import ring from './contextRing';
import record from '../session/recordContextUsage';
import renderEvent from '../agent/renderEventHtml';
import live from '../ui/live';
import append from '../session/appendEvent';

function fixture() {
 const events:any[]=[]; const refreshes:any[]=[];
 const ctx:any={state:{agent:{a:{model:'test'}}},fns:{
  auth:{actorId:async()=>null},agent:{wakeWaiters:async()=>{}},events:{emitAgentsChanged:()=>{throw Error('hidden usage must not mark unread');}},
  procs:{db:{run:async({sql,params}:any)=>{if(sql.startsWith('INSERT INTO events')){events.push(JSON.parse(params[2]));return {rows:[{idx:events.length-1}]};}return {};},select:async({sql}:any)=>{expect(sql).toContain("'context_usage'");expect(sql).toContain('LIMIT 1');const authoritative=events.some(e=>['context_usage','compaction_completed'].includes(e.type));expect(sql).toContain('NOT EXISTS');const event=events.filter(e=>['context_usage','compaction_completed'].includes(e.type)||(!authoritative&&e.type==='assistant')).at(-1);return event?[{payload:JSON.stringify(event)}]:[];}},events:{refresh:(o:any)=>refreshes.push(o)},ui:{escape:({text}:any)=>Bun.escapeHTML(text)}},
  compaction:{contextWindow:async()=>100000},ui:{popup:({attrs,html}:any)=>`<button ${attrs}>${html}</button>`},session:{appendEvent:(o:any)=>append(ctx,null,o)}
 }};
 return {ctx,events,refreshes,render:()=>ring(ctx,null,{agentId:'a'}),record:(usage:any)=>record(ctx,null,{id:'a',usage})};
}
test('tool-only model usage persists and refreshes meter without assistant event',async()=>{
 const f=fixture();await f.record({prompt_tokens:70000,completion_tokens:1000});
 expect(f.events.map(e=>e.type)).toEqual(['context_usage']);expect(await renderEvent(f.ctx,null,{event:f.events[0],agentId:'a'})).toBe('');
 const region=live(f.ctx,null,{id:'chat-context-ring',url:'/chat/a/ring',topic:f.refreshes[0].topic,swap:'innerHTML'});expect(region).toContain('data-live-topic="agent:a"');expect(region).toContain('hx-trigger="hyper-live');expect(region).toContain('hx-get="/chat/a/ring"');
 expect(f.refreshes).toEqual([{topic:'agent:a',reason:'event'}]);const r1=await f.render();expect(r1).toContain('71%');expect(r1).toContain('data-context-total');expect(r1).toContain('>71k/100k<');
 await f.record({prompt_tokens:79000,completion_tokens:1000});expect(await f.render()).toContain('80%');
});
test('successful compaction reduces meter until next request, failed compaction does not',async()=>{
 const f=fixture();await f.record({prompt_tokens:89000,completion_tokens:1000});
 f.events.push({type:'compaction_completed',tokensAfter:12000});expect(await f.render()).toContain('12%');expect(await f.render()).toContain('estimate after compaction');
 f.events.push({type:'compaction_failed',error:'stale'});expect(await f.render()).toContain('12%');
 await f.record({prompt_tokens:15000,completion_tokens:1000});expect(await f.render()).toContain('16%');expect(await f.render()).not.toContain('estimate');
});
test('assistant cards never override authoritative usage, including missing zero and malformed usage',async()=>{
 const f=fixture();await f.record({prompt_tokens:70000,completion_tokens:0});
 for(const usage of [undefined,{prompt_tokens:0,completion_tokens:0},{prompt_tokens:'bad'}]){f.events.push({type:'assistant',usage});expect(await f.render()).toContain('70%');}
 f.events.push({type:'compaction_completed',tokensAfter:10000});f.events.push({type:'assistant'});expect(await f.render()).toContain('10%');
});
test('missing or invalid provider usage never reuses stale counts or invents counts',async()=>{
 const f=fixture();await f.record({prompt_tokens:90000,completion_tokens:0});
 for(const usage of [null,{}, {prompt_tokens:Infinity,completion_tokens:0},{prompt_tokens:-1,completion_tokens:2}]){await f.record(usage);expect(await f.render()).toBe('');}
});
