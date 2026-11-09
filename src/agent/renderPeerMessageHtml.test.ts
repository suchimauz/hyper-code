import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import render from './renderPeerMessageHtml';
import renderEvent from './renderEventHtml';
import renderAutomation from './renderAutomationEventHtml';
import renderCompaction from './renderCompactionEventHtml';
const ctx = { fns: { auth: { getUser: async () => ({name:'Владелец <owner>'}), author: async ({userId}: {userId:string}) => userId==='agent:sender' ? {name:'Тестировщик <b>',hue:353} : userId==='agent:owner' ? {name:'Оркестратор',hue:120} : null }, agent: {renderAutomationEventHtml: (opts: Parameters<typeof renderAutomation>[2]) => renderAutomation(ctx,null,opts), renderCompactionEventHtml: (opts: Parameters<typeof renderCompaction>[2]) => renderCompaction(ctx,null,opts), renderPeerMessageHtml: (opts: Parameters<typeof render>[2]) => render(ctx,null,opts)}, procs: {ui: {button: () => '<button>delete</button>'}} } } as unknown as Context;
const event = {idx:12,ts:1793096938882,actor:'agent:sender',agentMessage:{from:'sender',title:'Stored name',body:'first line\nsecond line\nthird line\nfourth <script>alert(1)</script>',hop:3}};
describe('peer service message cards',()=>{
 test('incoming body is escaped, preview begins verbatim, native disclosure starts closed',async()=>{
  const html=await render(ctx,null,{agentId:'owner',event});const w=new Window();
  try{w.document.body.innerHTML=html;const card=w.document.querySelector('details')!;
   expect(card.open).toBe(false);expect(card.classList.contains('service-message--incoming')).toBe(true);
   expect(card.querySelector('.service-preview')!.textContent).toBe(event.agentMessage.body);
   expect(card.querySelector('pre')!.textContent).toBe(event.agentMessage.body);
   expect(card.querySelector('script')).toBeNull();expect(html).toContain('Тестировщик &lt;b&gt;');
   expect(html).toContain('Получено');expect(html).toContain('sender → owner');expect(html).toContain('--service-hue:353');
   expect(card.querySelector('summary')!.getAttribute('aria-controls')).toBe(card.querySelector('.service-body')!.id);
   expect(card.querySelector('summary a')).toBeNull();
  }finally{await w.happyDOM.close();}
 });
 test('leading blank lines and owner attribution survive HTML parsing',async()=>{
  const w=new Window();try{const body='\n\nПервый текст\n';w.document.body.innerHTML=await render(ctx,null,{agentId:'owner',event:{...event,agentMessage:{...event.agentMessage,body,onBehalfOf:'owner-id'}}});expect(w.document.querySelector('pre')!.textContent).toBe(body);expect(w.document.querySelector('.service-body-meta')!.textContent).toContain('от имени Владелец <owner>');expect(w.document.querySelector('owner')).toBeNull();}finally{await w.happyDOM.close();}
 });
 test('long original is not truncated, while preview is bounded',async()=>{
  const body='Строка <unsafe>\n'.repeat(2500);const html=await render(ctx,null,{agentId:'owner',event:{...event,agentMessage:{...event.agentMessage,body}}});const w=new Window();
  try{w.document.body.innerHTML=html;expect(w.document.querySelector('pre')!.textContent).toBe(body);expect(w.document.querySelector('.service-preview')!.textContent).toBe(body.slice(0,1000));}finally{await w.happyDOM.close();}
 });
 test('outgoing keeps sender color, recipient title, explicit route and safe pending status',async()=>{
  const outgoingAgentMessage={deliveryKey:'receipt',to:'sender',body:'sent <b>plain</b>',status:'delivered' as const,messageIdx:99};
  const html=await render(ctx,null,{agentId:'owner',event:{idx:20,ts:event.ts,outgoingAgentMessage}});
  expect(html).toContain('service-message--outgoing');expect(html).toContain('Исходящее');expect(html).toContain('Отправлено');expect(html).toContain('Кому: Тестировщик');expect(html).toContain('owner → sender');expect(html).toContain('--service-hue:120');
  expect(html).toContain('href="/agent/sender#m-99"');
  const w=new Window();try{w.document.body.innerHTML=html;const link=w.document.querySelector('.service-delivery-link')!;expect(link.closest('summary')).toBeNull();expect(link.closest('details')).toBeNull();expect(w.document.querySelector('time')!.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);expect(w.document.querySelector('time')!.getAttribute('datetime')).toBe(new Date(event.ts).toISOString());}finally{await w.happyDOM.close();}
  const queued=await render(ctx,null,{agentId:'owner',event:{outgoingAgentMessage:{...outgoingAgentMessage,status:'queued'}}});expect(queued).toContain('В очереди');expect(queued).not.toContain('Отправлено');expect(queued).not.toContain('service-delivery-link');
 });
 test('delivery links require a confirmed nonnegative integer message index and encode the recipient',async()=>{
  for(const messageIdx of [undefined,null,-1,1.5,NaN]){const html=await render(ctx,null,{agentId:'owner',event:{outgoingAgentMessage:{deliveryKey:'r',to:'peer',body:'text',status:'delivered',messageIdx}}});expect(html).not.toContain('service-delivery-link');}
  const html=await render(ctx,null,{agentId:'owner',event:{outgoingAgentMessage:{deliveryKey:'r',to:'a/b?x',body:'text',status:'delivered',messageIdx:0}}});expect(html).toContain('href="/agent/a%2Fb%3Fx#m-0"');
 });
 test('missing agent uses durable title, no HTML injection or invalid timestamp',async()=>{
  const html=await render(ctx,null,{agentId:'owner',event:{idx:4,ts:NaN,agentMessage:{from:'deleted',title:'Past <agent>',body:'hello'}}});
  expect(html).toContain('Past &lt;agent&gt;');expect(html).not.toContain('datetime=');expect(html).toContain('--service-hue:210');
 });
 test('renderer retains incoming message anchor and deletion, outgoing uses only event anchor',async()=>{
  const incoming=await renderEvent(ctx,null,{agentId:'owner',event:{...event,type:'user',messageIdx:99}});
  expect(incoming).toContain('id="m-99"');expect(incoming).toContain('service-actions');
  const outgoing=await renderEvent(ctx,null,{agentId:'owner',event:{idx:20,type:'agent_message_outgoing',outgoingAgentMessage:{deliveryKey:'r',to:'sender',body:'text',status:'delivered'}}});
  expect(outgoing).toContain('id="event-20"');expect(outgoing).not.toContain('id="m-');expect(outgoing).not.toContain('service-actions');
 });
});
