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
  expect(bar.querySelector('.project-mobile-toggle')?.textContent).toBe('2');
  const chooser=(w.document.querySelector('template[data-project-template="chats"]') as any).content;
  expect([...chooser.querySelectorAll('.project-mobile-chat')].map(a=>a.getAttribute('href'))).toEqual(['/agent/b','/agent/a']);
  expect(chooser.querySelector('nav a[aria-current="page"]')?.textContent).toBe('Second');
  expect(chooser.querySelector('.project-mobile-menu').innerHTML).toContain('&lt;Chat&gt;');expect(chooser.querySelector('a[href="/agent/closed"]')).toBeNull();
  expect(chooser.querySelector('nav a')?.getAttribute('hx-target')).toBe('#main');
  await w.happyDOM.close();
 });
 test('empty personal tabs show zero instead of all project chats',async()=>{
  const {tabs}=await render(ctx,null,{...base,tabIds:[]});const w=new Window();w.document.body.innerHTML=tabs;
  expect(w.document.querySelector('.project-mobile-toggle')?.textContent).toBe('0');const chooser=(w.document.querySelector('template[data-project-template="chats"]') as any).content;expect(chooser.querySelector('.project-mobile-menu')?.textContent).toBe('Нет открытых чатов');
  expect(chooser.querySelector('.project-mobile-menu a')).toBeNull();await w.happyDOM.close();
 });
 test('live refresh preserves chooser and focus; Escape, outside and selection close it',async()=>{
  const w=new Window({url:'http://local/agent/b'});const d=w.document;const {tabs}=await render(ctx,null,base);
  d.body.innerHTML='<aside id="project-sidebar"></aside><main id="main"><section id="chat-panel" data-agent-id="b"></section><div id="project-tabs-host">'+tabs+'</div></main><button id="outside">Outside</button>';
  let live:any;const visits:string[]=[];
  (w as any).hyperLive={subscribe:(o:any)=>live=o};
  (w as any).fetch=async()=>({ok:true,json:async()=>({sidebar:'',tabs})});
  (w as any).htmx={process:()=>{},ajax:async(_m:string,url:string)=>{visits.push(url);}};
  w.eval(source);await tick();
  const open=()=>{(d.querySelector('.project-mobile-toggle') as any).click();return d.querySelector('.project-panel-dialog') as any;};
  let chooser=open();expect(chooser.parentElement).toBe(d.body);expect(chooser.open).toBe(true);
  (chooser.querySelector('a[href="/agent/a"]') as any).focus();await live.resync();await tick();
  chooser=d.querySelector('.project-panel-dialog') as any;expect(chooser.open).toBe(true);expect(d.activeElement?.getAttribute('href')).toBe('/agent/a');
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await tick();expect(d.querySelector('.project-panel-dialog')).toBeNull();expect(d.activeElement?.classList.contains('project-mobile-toggle')).toBe(true);
  chooser=open();chooser.dispatchEvent(new w.Event('cancel',{cancelable:true}));await tick();expect(d.querySelector('.project-panel-dialog')).toBeNull();
  chooser=open();chooser.dispatchEvent(new w.MouseEvent('click',{bubbles:true,clientX:-1,clientY:-1}));await tick();expect(d.querySelector('.project-panel-dialog')).toBeNull();
  chooser=open();chooser.querySelector('a').dispatchEvent(new w.MouseEvent('click',{bubbles:true,button:0,cancelable:true}));await tick();expect(d.querySelector('.project-panel-dialog')).toBeNull();expect(visits).toEqual(['/agent/b']);await w.happyDOM.close();
 });
});

test('mobile chat list preserves its custom avatar and selected model tooltip',async()=>{
 const model='opencode:deepseek-v4.1-flash';
 const out=await render(ctx,null,{...base,chats:[{id:'a',title:'DeepSeek chat',model,icon:'<svg><path d="M0 0"/></svg>',runState:'running',hasUnread:true}],tabIds:['a']});
 const w=new Window();try{
  w.document.body.innerHTML=out.tabs;
  const row=(w.document.querySelector('template[data-project-template="chats"]') as any).content.querySelector('.project-mobile-chat')!;
  expect(row.querySelector('.project-mobile-model .chat-icon')).not.toBeNull();
  expect(row.querySelector('.project-mobile-model')?.getAttribute('title')).toBe(model);
  expect(decodeURIComponent(row.querySelector('.project-mobile-model img')!.getAttribute('src')!.split(',')[1])).toBe('<svg><path d="M0 0"/></svg>');
  expect(row.querySelectorAll('.project-mobile-model .chat-icon')).toHaveLength(1);
  expect(w.document.querySelector('.project-tab img')?.getAttribute('src')).toBe(row.querySelector('.project-mobile-model img')?.getAttribute('src'));
  expect(row.querySelector('.project-mobile-model .chat-icon-ring')).not.toBeNull();expect(row.querySelector('.project-mobile-running')).toBeNull();expect(row.querySelector('.project-mobile-unread')).not.toBeNull();
  expect(row.querySelector('.project-title')?.textContent).toBe('DeepSeek chat');
 }finally{await w.happyDOM.close();}
});

test('management popup hands off its connected trigger then removes the dialog',async()=>{
 const w=new Window({url:'http://local/agent/b'}),d=w.document;try{
 const tabs=(await render(ctx,null,base)).tabs;
 d.body.innerHTML='<aside id="project-sidebar"></aside><main id="main"><section id="chat-panel" data-agent-id="b"></section><div id="project-tabs-host">'+tabs+'</div></main>';
 (w as any).fetch=async()=>({ok:true,json:async()=>({sidebar:'',tabs})});(w as any).htmx={process:()=>{}};
 w.eval(source);await tick();(d.querySelector('.project-mobile-manage') as any).click();
 const dialog=d.querySelector('.project-panel-dialog')!;expect(dialog.getAttribute('data-project-dialog')).toBe('manage');
 let connected=false;d.addEventListener('click',e=>{if((e.target as any).closest('[hx-popup]'))connected=(e.target as any).isConnected;});
 (dialog.querySelector('[hx-popup="projects.iconPopup"]') as any).click();expect(connected).toBe(true);await tick();expect(d.querySelector('.project-panel-dialog')).toBeNull();
 }finally{await w.happyDOM.close();}
});

test.each(['close','archive'])('%s uses its distinct endpoint and refreshes without navigating another active tab',async(action)=>{
 const w=new Window({url:'http://local/agent/b'}),d=w.document;try{
 const tabs=(await render(ctx,null,base)).tabs;const requests:{url:string,body:any}[]=[],visits:string[]=[];
 d.body.innerHTML='<aside id="project-sidebar"></aside><main id="main"><section id="chat-panel" data-agent-id="b"></section><div id="project-tabs-host">'+tabs+'</div></main>';
 (w as any).fetch=async(url:string,opts:any)=>{requests.push({url,body:opts?.body?JSON.parse(opts.body):null});return {ok:true,json:async()=>({ok:true,sidebar:'',tabs,fallbackUrl:'/agent/b'})};};
 (w as any).htmx={process:()=>{},ajax:async(_m:string,url:string)=>{visits.push(url);}};
 w.eval(source);await tick();requests.length=0;
 if(action==='close')(d.querySelector('.project-mobile-toggle') as any).click();
 const scope=action==='close'?d.querySelector('.project-panel-dialog')!:d.querySelector('.project-tabs')!;
 (scope.querySelector('[data-project-action="'+action+'"][data-chat-id="a"]') as any).click();await tick();
 const posts=requests.filter(r=>r.body);expect(posts).toHaveLength(1);
 expect(posts[0]).toEqual(action==='close'?{url:'/projects/action',body:{action:'close',projectId:'p',agentId:'a'}}:{url:'/agent/a/archive',body:{}});
 expect(requests.some(r=>!r.body&&r.url.startsWith('/projects/'))).toBe(true);expect(visits).toEqual([]);
 }finally{await w.happyDOM.close();}
});
