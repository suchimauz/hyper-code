import {describe,test,expect} from 'bun:test';
import {Window} from 'happy-dom';
import render from './renderChrome.ts';
import button from '../procs/ui/button.ts';
import popup from '../ui/popup.ts';
const ctx:any={fns:{procs:{ui:{escape:({text}:any)=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),attr:()=>''}},ui:{},chat:{icon:()=>''}}};
ctx.fns.procs.ui.button=(o:any)=>button(ctx,null,o);ctx.fns.ui.popup=(o:any)=>popup(ctx,null,o);
const base={projects:[{id:'p',title:'Project',dir:'/work',host:''}],projectId:'p',activeId:'both',chats:[{id:'quiet',title:'Quiet',runState:'idle'},{id:'working',title:'Working',runState:'running'},{id:'unread',title:'Unread',runState:'idle',hasUnread:true},{id:'both',title:'Both',runState:'waiting',hasUnread:true},{id:'closed',title:'Closed',runState:'running',hasUnread:true}],tabIds:['both','missing','quiet','unread','working']};
const tick=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
describe('mobile chat status indicators',()=>{
 test('independently renders authorized running and unread states in personal order',async()=>{
  const w=new Window();w.document.body.innerHTML=(await render(ctx,null,base)).tabs;
  const links=[...w.document.querySelectorAll('.project-mobile-chat')];
  expect(links.map(a=>a.getAttribute('href'))).toEqual(['/agent/both','/agent/quiet','/agent/unread','/agent/working']);
  expect(links.map(a=>!!a.querySelector('.project-mobile-running'))).toEqual([true,false,false,true]);
  expect(links.map(a=>!!a.querySelector('.project-mobile-unread'))).toEqual([true,false,true,false]);
  expect(links[0].getAttribute('aria-current')).toBe('page');expect(links[0].classList.contains('selected')).toBe(true);
  for(const el of w.document.querySelectorAll('.project-mobile-running,.project-mobile-unread')){
   expect(el.getAttribute('role')).toBe('img');expect(el.getAttribute('aria-label')).toBe(el.classList.contains('project-mobile-running')?'В работе':'Непрочитанный ответ');
  }
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
  const chooser=d.querySelector('.project-mobile-switcher') as any;chooser.open=true;(chooser.querySelector('a[href="/agent/working"]') as any).focus();
  response=updated;await live.resync();await tick();
  expect((d.querySelector('.project-mobile-switcher') as any).open).toBe(true);expect(d.activeElement?.getAttribute('href')).toBe('/agent/working');
  expect(d.querySelector('.project-mobile-chat[aria-current="page"]')?.getAttribute('href')).toBe('/agent/both');
  expect(d.querySelectorAll('.project-mobile-running').length).toBe(0);
  expect(d.querySelectorAll('.project-mobile-unread').length).toBe(1);expect(d.querySelector('.project-mobile-unread')?.closest('a')?.getAttribute('href')).toBe('/agent/working');
  await w.happyDOM.close();
 });
});
