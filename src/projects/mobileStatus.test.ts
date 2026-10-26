import {describe,test,expect} from 'bun:test';
import {Window} from 'happy-dom';
import render from './renderChrome.ts';
import button from '../procs/ui/button.ts';
import chatIcon from '../chat/icon';
import modelLogo from '../ui/modelLogo';
import popup from '../ui/popup.ts';
const ctx:any={fns:{procs:{ui:{escape:({text}:any)=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),attr:()=>''}},ui:{},chat:{icon:()=>''}}};
ctx.fns.procs.ui.button=(o:any)=>button(ctx,null,o);ctx.fns.ui.popup=(o:any)=>popup(ctx,null,o);
ctx.fns.chat.icon=(o:any)=>chatIcon(ctx,null,o);ctx.fns.ui.modelLogo=(o:any)=>modelLogo(ctx,null,o);
const base={projects:[{id:'p',title:'Project',dir:'/work',host:''}],projectId:'p',activeId:'both',chats:[{id:'quiet',title:'Quiet',runState:'idle'},{id:'working',title:'Working',runState:'running'},{id:'unread',title:'Unread',runState:'idle',hasUnread:true},{id:'both',title:'Both',runState:'waiting',hasUnread:true},{id:'closed',title:'Closed',runState:'running',hasUnread:true}],tabIds:['both','missing','quiet','unread','working']};
const tick=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
describe('mobile chat status indicators',()=>{
 test('current chat alone never adds other-chat counters',async()=>{
  const w=new Window();try{
   w.document.body.innerHTML=(await render(ctx,null,{...base,chats:base.chats.filter(c=>c.id===base.activeId),tabIds:[base.activeId]})).tabs;
   expect(w.document.querySelector('[data-project-other-running]')).toBeNull();
   expect(w.document.querySelector('[data-project-other-unread]')).toBeNull();
   const activity=w.document.querySelector('.project-mobile-activity');
   expect(activity?.previousElementSibling?.classList.contains('project-title')).toBe(true);
   expect(activity?.querySelector('.project-activity-spin')).not.toBeNull();
   expect(activity?.textContent).toBe('');
   expect(w.document.querySelector('.project-mobile-toggle')?.getAttribute('aria-label')).toBe('Открытые чаты: 1');
  }finally{await w.happyDOM.close();}
 });
 test('independently renders authorized running and unread states in personal order',async()=>{
  const w=new Window();w.document.body.innerHTML=(await render(ctx,null,base)).tabs;
  const chooser=(w.document.querySelector('template[data-project-template="chats"]') as any).content;
  const links=[...chooser.querySelectorAll('.project-mobile-chat')];
  expect(links.map(a=>a.getAttribute('href'))).toEqual(['/agent/both','/agent/quiet','/agent/unread','/agent/working']);
  expect(links.map(a=>!!a.querySelector('.project-mobile-model .chat-icon-ring'))).toEqual([true,false,false,true]);
  expect(chooser.querySelectorAll('.project-mobile-model .chat-icon-ring')).toHaveLength(2);
  expect(links.map(a=>!!a.querySelector('.project-mobile-unread'))).toEqual([true,false,true,false]);
  expect(links[0].getAttribute('aria-current')).toBe('page');expect(links[0].classList.contains('selected')).toBe(true);
  for(const el of chooser.querySelectorAll('.project-mobile-unread')){
   expect(el.getAttribute('role')).toBe('img');expect(el.getAttribute('aria-label')).toBe('Непрочитанный ответ');
  }
  expect(w.document.querySelector('[data-project-other-running]')).toBeNull();
  expect(w.document.querySelector('[data-project-other-unread]')?.getAttribute('data-project-other-unread')).toBe('2');
  const dot=w.document.querySelector('.project-mobile-toggle')?.querySelector('[data-project-other-unread]');
  expect(dot?.hasAttribute('data-project-other-unread')).toBe(true);
  expect(dot?.classList.contains('project-unread-dot')).toBe(true);
  expect(dot?.textContent).toBe('');
  expect(w.document.querySelector('.project-mobile-toggle .ph-chats')).not.toBeNull();
  expect(w.document.querySelector('.project-mobile-toggle')?.getAttribute('aria-label')).not.toContain('работают');
  expect(w.document.querySelector('.project-tabs .project-mobile-running')).toBeNull();
  expect(w.document.querySelector('.project-tabs .project-mobile-unread')).toBeNull();
  await w.happyDOM.close();
 });
 test('existing live navigation replaces statuses without losing selection, chooser or focus',async()=>{
  const source=await Bun.file(new URL('./$script_navigation.js',import.meta.url)).text();
  const w=new Window({url:'http://local/agent/both'}),d=w.document;
  const initial=await render(ctx,null,base);
  const updated=await render(ctx,null,{...base,chats:base.chats.map(c=>({...c,runState:'idle',hasUnread:c.id==='working'}))});
  d.body.innerHTML='<aside id="project-sidebar"></aside><main id="main"><section id="chat-panel" data-agent-id="both"></section><div id="project-tabs-host">'+initial.tabs+'</div></main>';
  let live:any;let response=initial;
  (w as any).hyperLive={subscribe:(o:any)=>live=o};(w as any).fetch=async()=>({ok:true,json:async()=>response});(w as any).htmx={process:()=>{}};
  w.eval(source);await tick();
  (d.querySelector('.project-mobile-toggle') as any).click();const chooser=d.querySelector('.project-panel-dialog') as any;(chooser.querySelector('a[href="/agent/working"]') as any).focus();
  response=updated;await live.resync();await tick();
  expect((d.querySelector('.project-panel-dialog') as any).open).toBe(true);expect(d.activeElement?.getAttribute('href')).toBe('/agent/working');
  expect(d.querySelector('.project-mobile-chat[aria-current="page"]')?.getAttribute('href')).toBe('/agent/both');
  expect(d.querySelector('[data-project-other-running]')).toBeNull();
  expect(d.querySelector('[data-project-other-unread]')?.getAttribute('data-project-other-unread')).toBe('1');
  expect(d.querySelectorAll('.project-mobile-model .chat-icon-ring').length).toBe(0);
  expect(d.querySelector('.project-mobile-activity')).toBeNull();
  expect(d.querySelectorAll('.project-mobile-unread').length).toBe(1);expect(d.querySelector('.project-mobile-unread')?.closest('a')?.getAttribute('href')).toBe('/agent/working');
  await w.happyDOM.close();
 });
});
