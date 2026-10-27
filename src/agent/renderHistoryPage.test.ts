import {expect, test} from 'bun:test';
import {Window} from 'happy-dom';
import historyPage from './renderHistoryPage';
import renderEvent from './renderEventHtml';
import renderEvents from './renderEventsHtml';
import renderPeer from './renderPeerMessageHtml';
import renderSleep from './renderSleepContextHtml';
import chatColumn from '../ui/chatColumn';
import route from './$route_$id_events.html_GET';
import {renderCtx} from '../ui/testRender.entry';

const stamp=1793102319502;
const outgoing=(idx: number)=>({idx,ts:stamp,type:'agent_message_outgoing',actor:'agent:owner',outgoingAgentMessage:{deliveryKey:'key-'+idx,to:'recipient',title:'Recipient',body:'Delivered original <text>',status:'delivered',messageIdx:42}});
async function harness(events: any[]) {
 const queries: any[]=[];const errors:string[]=[];
 const ctx=await renderCtx({
  'auth.author':async(_c,_s,o)=>({name:o.userId==='agent:recipient'?'Recipient':'Owner',hue:210}),
  'auth.markSeen':async()=>{},'auth.getUser':async()=>null,
  'procs.log.warn':(_c,_s,o)=>errors.push(o.msg),
  'session.getEvents':(_c,_s,o)=>{queries.push(o);let rows=events.filter(e=>o.beforeIdx!=null?e.idx<o.beforeIdx:e.idx>=(o.fromIdx??0));return o.beforeIdx!=null?rows.slice(-(o.limit??rows.length)):rows.slice(0,o.limit??rows.length);},
  'session.getMaxEventIdx':()=>Math.max(-1,...events.map(e=>e.idx)),
  'agent.renderEventHtml':renderEvent,'agent.renderEventsHtml':renderEvents,'agent.renderPeerMessageHtml':renderPeer,
  'agent.renderHistoryPage':historyPage,'agent.renderSleepContextHtml':renderSleep,
  'agent.normalizeSleepContext':(_c,_s,o)=>o.sleepContext,
  'agent.getSleepGeneration':(_c,_s,o)=>o.sleepContext?.generations?.find((g:any)=>g.revision===o.sleepContext.activeRevision),
  'procs.db.select':()=>[{id:'owner'}],
  'agent.renderTransientStream':()=>'', 'agent.renderStatusBar':()=>'', 'agent.renderActiveToolCall':()=>'',
  'chat.buildRenderContext':()=>null,'chat.modelChip':()=>'', 'chat.contextRing':()=>'',
  'ui.inplacePopup':()=>'', 'ui.chatComposer':()=>'',
 });
 return {ctx,queries,errors};
}
function ids(html:string){return [...html.matchAll(/id="(?:m|event)-(\d+)"/g)].map(m=>Number(m[1]));}

test('hidden audit rows cannot evict outgoing cards from a visible page',async()=>{
 const events=[{idx:0,type:'user',text:'first',messageIdx:0},outgoing(1),...Array.from({length:650},(_,i)=>({idx:i+2,type:'context_usage'})),{idx:652,type:'assistant',text:'last',messageIdx:652}];
 const {ctx,queries}=await harness(events);
 const page=await historyPage(ctx,null,{agentId:'owner',beforeIdx:653,limit:3});
 expect(page.visibleCount).toBe(3);expect(page.nextBefore).toBeNull();expect(ids(page.html)).toEqual([0,1,652]);
 expect(page.html).toContain('Исходящее');expect(page.html).toContain('/agent/recipient#m-42');expect(page.html).toContain(new Date(stamp).toISOString());
 expect(queries.length).toBe(4);expect(queries.every(q=>q.limit===200)).toBe(true);
});

test('pages use exclusive original indices: no gaps, duplicates, or reordering across hidden runs',async()=>{
 const events=[{idx:4,type:'user',text:'first',messageIdx:4},outgoing(9),...Array.from({length:300},(_,i)=>({idx:i+10,type:'job'})),{idx:310,type:'assistant',text:'last',messageIdx:310}];
 const {ctx}=await harness(events);const pages=[];let before=311;
 for(let i=0;i<5;i++){const p=await historyPage(ctx,null,{agentId:'owner',beforeIdx:before,limit:1});pages.push(p);if(p.nextBefore==null)break;before=p.nextBefore;}
 expect(pages.flatMap(p=>ids(p.html))).toEqual([310,9,4]);expect(pages.at(-1)?.nextBefore).toBeNull();
 expect(pages[0]?.nextBefore).toBe(310);expect(pages[1]?.nextBefore).toBe(9);
});

test('empty and all-hidden histories terminate without endless empty pagers',async()=>{
 const {ctx,queries}=await harness(Array.from({length:451},(_,idx)=>({idx,type:'context_usage'})));
 expect(await historyPage(ctx,null,{agentId:'owner',beforeIdx:451})).toEqual({html:'',visibleCount:0,nextBefore:null});expect(queries).toHaveLength(3);
 const n=queries.length;expect((await historyPage(ctx,null,{agentId:'owner',beforeIdx:0})).html).toBe('');expect(queries).toHaveLength(n);
});

test('unknown events stay hidden while failed renderers remain visible diagnostics',async()=>{
 const {ctx,errors}=await harness([{idx:0,type:'future_audit'},outgoing(1)]);
 ctx.fns.auth.author=async()=>{throw new Error('author lookup failed');};
 const page=await historyPage(ctx,null,{agentId:'owner',beforeIdx:2,limit:2});
 expect(page.visibleCount).toBe(1);expect(page.html).toContain('this message could not be rendered (#1)');expect(page.nextBefore).toBeNull();expect(errors).toHaveLength(1);
});

test('history HTTP route counts visible cards and live tail retains raw event cursor',async()=>{
 const events=[{idx:0,type:'user',text:'first',messageIdx:0},outgoing(1),...Array.from({length:220},(_,i)=>({idx:i+2,type:'context_usage'}))];
 const {ctx}=await harness(events);
 const older=await route(ctx,null,{req:new Request('http://test/agent/owner/events.html?before=222&limit=1'),params:{id:'owner'}});const html=await older.text();
 expect(html).toContain('Исходящее');expect(html).toContain('before=1&limit=1');expect(html).not.toContain('id="msg-tail"');
 const tail=await route(ctx,null,{req:new Request('http://test/agent/owner/events.html?offset=2'),params:{id:'owner'}});const tailHtml=await tail.text();
 expect(tailHtml).toContain('offset=222');expect(tailHtml).toContain('id="msg-tail"');expect(tailHtml).not.toContain('Исходящее');
});

test('initial compacted chat keeps old correspondence and UI-only events, with no synthetic m-0 anchors',async()=>{
 const {ctx}=await harness([{idx:0,type:'user',text:'old preserved message',messageIdx:0},outgoing(1),...Array.from({length:240},(_,i)=>({idx:i+2,type:'context_usage'}))]);
 ctx.state.agent.owner={id:'owner',model:'mock',sleepContext:{mode:'compact',activeRevision:1,generations:[{revision:1,tailStart:999,sourceOffset:999,contextMessages:[{role:'user',content:'summary <unsafe>'}]}]}};
 const html=await chatColumn(ctx,null,{agentId:'owner'});const w=new Window();
 try{w.document.body.innerHTML=html;const d=w.document;
  expect(d.querySelectorAll('.service-message--outgoing')).toHaveLength(1);expect(d.querySelectorAll('#m-0')).toHaveLength(1);
  expect(d.querySelector('[data-compact-context]')?.hasAttribute('open')).toBe(false);
  expect(d.querySelector('[data-compact-context]')?.querySelector('[id^=m-]')).toBeNull();
  expect(html).toContain('old preserved message');expect(html).toContain('summary &lt;unsafe&gt;');expect(html).toContain('offset=242');
 }finally{await w.happyDOM.close();}
});
