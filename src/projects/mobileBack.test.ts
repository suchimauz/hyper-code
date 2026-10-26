import {describe,test,expect} from 'bun:test';
import {Window} from 'happy-dom';
const source=await Bun.file(new URL('./$script_navigation.js',import.meta.url)).text();
const tick=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const chrome='<div data-project-id="p"><button data-project-panel="manage">Проект</button><template data-project-template="manage"><header><button class="project-panel-back" data-project-panel-close>Назад</button><h2 id="project-panel-title">Проект</h2><button class="project-panel-close" data-project-panel-close>×</button></header><a href="/projects/view?projectId=p&archive=1">Архив чатов</a><a href="/projects/archive">Архив проектов</a></template></div>';
const pages='<header class="project-page-backbar"><a data-project-page-back href="/">Назад</a></header><section data-project-page data-project-id="p"><a href="/projects/view?projectId=p&archive=1">Архив чатов</a><a href="/projects/archive">Архив проектов</a></section>';
function fixture(url='http://local/agent/a?mode=test#message-7'){
 const w=new Window({url});const d=w.document;const visits:string[]=[];
 const render=()=>{d.getElementById('main')!.innerHTML='<div id="project-tabs-host">'+chrome+'</div>'+(w.location.pathname.startsWith('/agent/')?'<section id="chat-panel" data-agent-id="a"><div id="messages"></div></section>':pages);};
 d.body.innerHTML='<aside id="project-sidebar"></aside><main id="main"></main>';render();
 (w as any).requestAnimationFrame=(fn:any)=>{fn();return 1;};
 (w as any).fetch=async()=>({ok:true,json:async()=>({ok:true,sidebar:'',tabs:chrome})});
 (w as any).htmx={process(){},async ajax(_method:string,path:string){visits.push(path);w.history.pushState({htmx:'preserved'},'',path);render();d.dispatchEvent(new w.CustomEvent('htmx:after:swap',{detail:{ctx:{target:d.getElementById('main')}}}));}};
 w.eval(source);
 const click=(selector:string)=>(d.querySelector(selector) as any)!.click();
 return {w,d,visits,click,render};
}
describe('mobile project return context',()=>{
 test('management Back closes in place without navigating or changing message scroll',async()=>{
  const f=fixture();await tick();const messages=f.d.getElementById('messages')!;messages.scrollTop=217;
  f.click('[data-project-panel]');expect(f.d.querySelector('dialog[open]')).not.toBeNull();
  f.click('dialog .project-panel-back');await tick();
  expect(f.d.querySelector('dialog')).toBeNull();expect(f.visits).toEqual([]);expect(messages.scrollTop).toBe(217);expect(f.w.location.href).toContain('#message-7');await f.w.happyDOM.close();
 });
 test('archive chain returns to exact menu entry URL and scroll, even after reload',async()=>{
  const f=fixture();await tick();f.d.getElementById('messages')!.scrollTop=217;f.d.getElementById('main')!.scrollTop=31;
  f.click('[data-project-panel]');f.click('dialog a');await tick();
  expect(f.d.querySelector('[data-project-page-back]')!.getAttribute('href')).toBe('/agent/a?mode=test#message-7');
  expect((f.w.history.state as any).htmx).toBe('preserved');
  f.click('[data-project-page] a[href="/projects/archive"]');await tick();
  const fresh=new Window({url:f.w.location.href});fresh.history.replaceState(f.w.history.state,'',fresh.location.href);fresh.document.body.innerHTML='<main id="main">'+pages+'</main>';fresh.eval(source);await tick();
  expect(fresh.document.querySelector('[data-project-page-back]')!.getAttribute('href')).toBe('/agent/a?mode=test#message-7');await fresh.happyDOM.close();
  f.click('[data-project-page-back]');await tick();
  expect(f.visits.at(-1)).toBe('/agent/a?mode=test#message-7');expect(f.d.getElementById('messages')!.scrollTop).toBe(217);expect(f.d.getElementById('main')!.scrollTop).toBe(31);expect((f.w.history.state as any).projectReturn).toBeNull();await f.w.happyDOM.close();
 });
 test('direct list entry returns to that list, not a global last chat',async()=>{
  const f=fixture('http://local/projects/view?projectId=p&list=1');await tick();f.d.getElementById('main')!.scrollTop=88;
  f.click('[data-project-page] a');await tick();f.click('[data-project-page-back]');await tick();
  expect(f.visits.at(-1)).toBe('/projects/view?projectId=p&list=1');expect(f.d.getElementById('main')!.scrollTop).toBe(88);await f.w.happyDOM.close();
 });
 test('stale or external entry metadata is ignored; direct archive has a safe fallback',async()=>{
  const f=fixture('http://local/projects/archive');await tick();
  f.w.history.replaceState({projectReturn:{page:'/projects/archive',source:{url:'//evil.invalid'}}},'',f.w.location.href);
  f.click('[data-project-page-back]');await tick();expect(f.visits.at(-1)).toBe('/');await f.w.happyDOM.close();
 });
 test('a newly opened menu records its own page and restores the earlier return context',async()=>{
  const f=fixture();await tick();f.click('[data-project-panel]');f.click('dialog a');await tick();
  f.d.getElementById('main')!.scrollTop=73;f.click('[data-project-panel]');f.click('dialog a[href="/projects/archive"]');await tick();
  expect(f.d.querySelector('[data-project-page-back]')!.getAttribute('href')).toBe('/projects/view?projectId=p&archive=1');
  f.click('[data-project-page-back]');await tick();expect(f.d.getElementById('main')!.scrollTop).toBe(73);
  expect(f.d.querySelector('[data-project-page-back]')!.getAttribute('href')).toBe('/agent/a?mode=test#message-7');await f.w.happyDOM.close();
 });
 test('modified archive links keep native new-tab behavior',async()=>{
  const f=fixture();await tick();f.click('[data-project-panel]');const e=new f.w.MouseEvent('click',{bubbles:true,cancelable:true,button:0,ctrlKey:true});f.d.querySelector('dialog a')!.dispatchEvent(e);await tick();expect(e.defaultPrevented).toBe(false);expect(f.visits).toEqual([]);await f.w.happyDOM.close();
 });
 test('closing a tab on the project page reloads its open-state list',async()=>{
  const f=fixture('http://local/projects/view?projectId=p&list=1');await tick();f.d.getElementById('main')!.insertAdjacentHTML('beforeend','<button data-project-action="close" data-chat-id="b">Close</button>');f.click('[data-project-action="close"]');await tick();expect(f.visits).toEqual(['/projects/view?projectId=p&list=1']);await f.w.happyDOM.close();
 });
});
