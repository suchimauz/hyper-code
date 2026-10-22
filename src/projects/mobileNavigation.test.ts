import {describe,test,expect} from 'bun:test';
import {Window} from 'happy-dom';
import render from './renderChrome.ts';
import button from '../procs/ui/button.ts';
import popup from '../ui/popup.ts';
import chatIcon from '../chat/icon';
import modelLogo from '../ui/modelLogo';
const ctx:any={fns:{procs:{ui:{escape:({text}:any)=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),attr:()=>''}},ui:{},chat:{icon:()=>''}}};
ctx.fns.procs.ui.button=(o:any)=>button(ctx,null,o);ctx.fns.ui.popup=(o:any)=>popup(ctx,null,o);
ctx.fns.chat.icon=(o:any)=>chatIcon(ctx,null,o);ctx.fns.ui.modelLogo=(o:any)=>modelLogo(ctx,null,o);
const base={projects:[{id:'p',title:'<Project>',dir:'/work',host:''}],projectId:'p',activeId:'b',chats:[{id:'a',title:'<Chat>',runState:'idle'},{id:'b',title:'Second',runState:'idle'},{id:'closed',title:'Closed',runState:'idle'}],tabIds:['b','missing','a']};
const source=await Bun.file(new URL('./$script_navigation.js',import.meta.url)).text();
const tick=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
describe('compact project mobile navigation',()=>{
 test('uses ordered personal open tabs only, escaping titles and highlighting selection',async()=>{
  const {tabs}=await render(ctx,null,base);const w=new Window();w.document.body.innerHTML=tabs;
  const bar=w.document.querySelector('.project-mobile-bar')!;
  expect(bar.querySelector('.project-mobile-name')?.textContent).toBe('<Project>');
  expect(bar.querySelector('summary')?.textContent).toBe('Чаты 2');
  expect([...bar.querySelectorAll('nav a')].map(a=>a.getAttribute('href'))).toEqual(['/agent/b','/agent/a']);
  expect(bar.querySelector('nav a[aria-current="page"]')?.textContent).toBe('Second');
  expect(bar.innerHTML).toContain('&lt;Chat&gt;');expect(bar.innerHTML).not.toContain('/agent/closed');
  expect(bar.querySelector('nav a')?.getAttribute('hx-target')).toBe('#main');
  await w.happyDOM.close();
 });
 test('empty personal tabs show zero instead of all project chats',async()=>{
  const {tabs}=await render(ctx,null,{...base,tabIds:[]});const w=new Window();w.document.body.innerHTML=tabs;
  expect(w.document.querySelector('summary')?.textContent).toBe('Чаты 0');expect(w.document.querySelector('.project-mobile-menu')?.textContent).toBe('Нет открытых чатов');
  expect(w.document.querySelector('.project-mobile-menu a')).toBeNull();await w.happyDOM.close();
 });
 test('live refresh preserves chooser and focus; Escape, outside and selection close it',async()=>{
  const w=new Window({url:'http://local/agent/b'});const d=w.document;const {tabs}=await render(ctx,null,base);
  d.body.innerHTML='<aside id="project-sidebar"></aside><main id="main"><section id="chat-panel" data-agent-id="b"></section><div id="project-tabs-host">'+tabs+'</div></main><button id="outside">Outside</button>';
  let live:any;const visits:string[]=[];
  (w as any).hyperLive={subscribe:(o:any)=>live=o};
  (w as any).fetch=async()=>({ok:true,json:async()=>({sidebar:'',tabs})});
  (w as any).htmx={process:()=>{},ajax:async(_m:string,url:string)=>{visits.push(url);}};
  w.eval(source);await tick();
  let chooser=d.querySelector('.project-mobile-switcher') as any;chooser.open=true;
  (chooser.querySelector('a[href="/agent/a"]') as any).focus();await live.resync();await tick();
  chooser=d.querySelector('.project-mobile-switcher') as any;expect(chooser.open).toBe(true);expect(d.activeElement?.getAttribute('href')).toBe('/agent/a');
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));expect(chooser.open).toBe(false);expect(d.activeElement?.tagName).toBe('SUMMARY');
  chooser.open=true;(d.getElementById('outside') as any).click();expect(chooser.open).toBe(false);
  chooser.open=true;chooser.querySelector('a').dispatchEvent(new w.MouseEvent('click',{bubbles:true,button:0,cancelable:true}));expect(chooser.open).toBe(false);await tick();expect(visits).toEqual(['/agent/b']);await w.happyDOM.close();
 });
});

test('mobile chat list shows the selected model even when the chat has its own avatar',async()=>{
 const model='opencode:deepseek-v4.1-flash';
 const out=await render(ctx,null,{...base,chats:[{id:'a',title:'DeepSeek chat',model,icon:'<svg><path d="M0 0"/></svg>',runState:'running',hasUnread:true}],tabIds:['a']});
 const w=new Window();try{
  w.document.body.innerHTML=out.tabs;
  const row=w.document.querySelector('.project-mobile-chat')!;
  expect(row.querySelector('.project-mobile-model .chat-icon')).not.toBeNull();
  expect(row.querySelector('.project-mobile-model')?.getAttribute('title')).toBe(model);
  expect(row.querySelector('.project-mobile-model')?.innerHTML).not.toContain('data:image/svg+xml,');
  expect(row.querySelector('.project-mobile-running')).not.toBeNull();expect(row.querySelector('.project-mobile-unread')).not.toBeNull();
  expect(row.querySelector('.project-title')?.textContent).toBe('DeepSeek chat');
 }finally{await w.happyDOM.close();}
});
