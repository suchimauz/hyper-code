import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import ring from './contextRing';
import record from '../session/recordContextUsage';
import renderEvent from '../agent/renderEventHtml';
import live from '../ui/live';
import append from '../session/appendEvent';

function fixture() {
 const events:any[]=[]; const refreshes:any[]=[];
 const budget = {estimatedTokens:71000,contextWindow:100000 as number|null,mode:'full',fallback:null as string|null,revision:null,messageCount:3,lastReportedTokens:null as number|null,lastReportedAt:null as number|null};
 const ctx:any={state:{agent:{a:{model:'test'}}},fns:{
  auth:{actorId:async()=>null},agent:{wakeWaiters:async()=>{},contextBudget:async({agentId}:any)=>{expect(agentId).toBe('a');return budget;}},events:{emitAgentsChanged:()=>{throw Error('hidden usage must not mark unread');}},
  procs:{db:{run:async({sql,params}:any)=>{if(sql.startsWith('INSERT INTO events')){events.push(JSON.parse(params[2]));return {rows:[{idx:events.length-1}]};}return {};},select:async()=>{throw Error('ring must not read stale usage events');}},events:{refresh:(o:any)=>refreshes.push(o)},ui:{escape:({text}:any)=>Bun.escapeHTML(text)}},
  ui:{popup:({attrs,html}:any)=>`<button ${attrs}>${html}</button>`},session:{appendEvent:(o:any)=>append(ctx,null,o)}
 }};
 return {ctx,events,refreshes,budget,render:()=>ring(ctx,null,{agentId:'a'}),record:(usage:any)=>record(ctx,null,{id:'a',usage})};
}
test('tool-only usage persists and refreshes meter; upcoming payload is independent of reported usage',async()=>{
 const f=fixture();await f.record({prompt_tokens:90000,completion_tokens:1000});
 expect(f.events.map(e=>e.type)).toEqual(['context_usage']);expect(await renderEvent(f.ctx,null,{event:f.events[0],agentId:'a'})).toBe('');
 const region=live(f.ctx,null,{id:'chat-context-ring',url:'/chat/a/ring',topic:f.refreshes[0].topic,swap:'innerHTML'});expect(region).toContain('data-live-topic="agent:a"');expect(region).toContain('hx-trigger="hyper-live');expect(region).toContain('hx-get="/chat/a/ring"');
 expect(f.refreshes).toEqual([{topic:'agent:a',reason:'event'}]);
 const html=await f.render();expect(html).toContain('71%');expect(html).toContain('>71k/100k<');expect(html).not.toContain('91k');
 f.budget.estimatedTokens=80000;expect(await f.render()).toContain('80%');
});
test('compact budget wins over stale assistant, usage and compaction events',async()=>{
 const f=fixture();await f.record({prompt_tokens:89000,completion_tokens:1000});
 f.events.push({type:'compaction_completed',tokensAfter:5000},{type:'assistant',usage:{prompt_tokens:99000}});
 f.budget.mode='compact';f.budget.estimatedTokens=12000;
 expect(await f.render()).toContain('>12k/100k<');expect(await f.render()).not.toContain('Полная история');
 f.events.push({type:'compaction_failed',error:'stale'});expect(await f.render()).toContain('12%');
});
test('fallback reasons stay accessible without a visible badge; reported count is secondary',async()=>{
 const f=fixture();f.budget.lastReportedTokens=9000;f.budget.lastReportedAt=1700000000000;
 const reasons={missing_generation:'нет поколения',missing_checkpoint:'нет сохранённого',incompatible_checkpoint:'несовместим',invalid_boundary:'некорректная граница'};
 const w=new Window();
 try {
  for(const [reason,text] of Object.entries(reasons)) {
   f.budget.fallback=reason;
   w.document.body.innerHTML=await f.render();
   const button=w.document.querySelector('[data-context-meter]')!;
   expect(button.querySelector('[data-context-fallback]')).toBeNull();
   expect(button.textContent).not.toContain('Полная история');
   expect(button.textContent).not.toContain(String.fromCharCode(0x2248));
   expect(button.querySelector('[data-context-total]')!.textContent).toBe('71k/100k');
   expect(button.getAttribute('aria-label')).toContain(text);
   expect(button.getAttribute('title')).toBe(button.getAttribute('aria-label'));
   expect(button.getAttribute('title')).toContain('Next request estimate 71000 tokens');
   expect(button.getAttribute('title')).toContain('Last successful request: 9000 tokens');
  }
  f.budget.fallback=null;expect(await f.render()).not.toContain('data-context-fallback');
 } finally {await w.happyDOM.close();}
});
test('zero or invalid budgets remain empty even with historical usage or fallback',async()=>{
 const f=fixture();f.budget.lastReportedTokens=90000;f.budget.fallback='missing_checkpoint';
 for(const used of [0,-1,NaN,Infinity]){f.budget.estimatedTokens=used;expect(await f.render()).toBe('');}
});
test('missing or invalid provider reports cannot replace the next-request estimate',async()=>{
 const f=fixture();
 for(const usage of [null,{}, {prompt_tokens:Infinity,completion_tokens:0},{prompt_tokens:-1,completion_tokens:2}]){await f.record(usage);expect(await f.render()).toContain('>71k/100k<');}
});

test('unavailable endpoint does not break chat or substitute historical usage',async()=>{
 const f=fixture();f.budget.lastReportedTokens=90000;
 f.ctx.fns.agent.contextBudget=async()=>{throw Error('provider disconnected');};
 const html=await f.render();expect(html).toContain('data-context-unavailable');
 expect(html).toContain('Оценка контекста следующего запроса недоступна');
 expect(html).not.toContain('90k');expect(html).not.toContain('provider disconnected');
});
