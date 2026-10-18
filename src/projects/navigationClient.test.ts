import {describe,test,expect} from 'bun:test';
import {Window} from 'happy-dom';
const source=await Bun.file(new URL('./$script_navigation.js',import.meta.url)).text();
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(){
 const w=new Window({url:'http://local/agent/a'});
 const d=w.document;
 d.body.innerHTML='<aside id="project-sidebar"></aside><main id="main"><section id="chat-panel" data-agent-id="a"></section><div id="project-tabs-host"><div data-project-id="p"></div></div></main>';
 const posts:string[]=[], gets:string[]=[], pending:Array<()=>void>=[], visits:string[]=[];
 let live:any;
 (w as any).hyperLive={subscribe:(o:any)=>live=o};
 const response=(data:any)=>({ok:true,json:async()=>data});
 (w as any).fetch=async(url:string,opts:any)=>{
  if(opts?.method==='POST'){posts.push(JSON.parse(opts.body).agentId);await new Promise<void>(resolve=>pending.push(resolve));return response({ok:true});}
  gets.push(url);return response({sidebar:'<a href="/projects/view?projectId=p" hx-get="/projects/view?projectId=p">P</a><a href="/agent/b">B</a>',tabs:'<div data-project-id="p"></div>'});
 };
 const swap=(id:string)=>{
  w.history.pushState({},'', '/agent/'+id);
  d.querySelector('#chat-panel')!.setAttribute('data-agent-id',id);
  d.dispatchEvent(new w.CustomEvent('htmx:after:swap',{detail:{ctx:{target:d.getElementById('main')}}}));
 };
 (w as any).htmx={process:()=>{},ajax:async(_verb:string,url:string,o:any)=>{expect(o.push).toBe('true');visits.push(url);swap(url.includes('/agent/')?url.split('/').pop()!:'a');}};
 w.eval(source);
 return {w,d,posts,gets,pending,visits,swap,live:()=>live};
}
describe('project client actual HTMX 4 lifecycle',()=>{
 test('archive-project requires confirmation and targets project, not current chat',async()=>{
  const f=fixture();await tick();f.pending.shift()!();await tick();
  const posts:any[]=[];(f.w as any).fetch=async(url:string,opts:any)=>{if(opts?.method==='POST')posts.push({url,body:JSON.parse(opts.body)});return {ok:false,json:async()=>({error:'fixture blocked'})};};
  const button=f.d.createElement('button');button.dataset.projectAction='archive-project';button.dataset.projectId='p';button.dataset.projectTitle='Project P';f.d.body.append(button);
  button.click();await tick();expect(posts).toEqual([]);expect(f.d.querySelector('dialog')?.hasAttribute('open')).toBe(true);
  (f.d.querySelector('[data-confirm-cancel]') as any).click();await tick();expect(posts).toEqual([]);expect(button.disabled).toBe(false);
  button.click();await tick();(f.d.querySelector('[data-confirm-accept]') as any).click();await tick();expect(posts).toEqual([{url:'/projects/action',body:{action:'archive-project',projectId:'p'}}]);await f.w.happyDOM.close();
 });
 test('restore-project requires confirmation before posting the exact project',async()=>{
  const f=fixture();await tick();f.pending.shift()!();await tick();
  const posts:any[]=[];(f.w as any).fetch=async(url:string,opts:any)=>{if(opts?.method==='POST')posts.push({url,body:JSON.parse(opts.body)});return {ok:false,json:async()=>({error:'fixture blocked'})};};
  const button=f.d.createElement('button');button.dataset.projectAction='restore-project';button.dataset.projectId='p';button.dataset.projectTitle='Project P';f.d.body.append(button);
  button.click();await tick();expect(posts).toEqual([]);expect(f.d.querySelector('h2')?.textContent).toContain('Разархивировать проект «Project P»');
  f.d.querySelector('dialog')!.dispatchEvent(new f.w.Event('cancel',{cancelable:true}));await tick();expect(posts).toEqual([]);
  button.click();await tick();(f.d.querySelector('[data-confirm-accept]') as any).click();await tick();expect(posts).toEqual([{url:'/projects/action',body:{action:'restore-project',projectId:'p'}}]);await f.w.happyDOM.close();
 });
 test('main swaps persist ordered selections; background refresh cannot select',async()=>{
  const f=fixture();await tick();expect(f.posts).toEqual(['a']);
  f.swap('b');await tick();expect(f.posts).toEqual(['a']);
  f.pending.shift()!();await tick();expect(f.posts).toEqual(['a','b']);
  f.pending.shift()!();await tick();f.live().resync();await tick();expect(f.posts).toEqual(['a','b']);
  expect(f.gets.at(-1)).toContain('agentId=b');await f.w.happyDOM.close();
 });
 test('project click waits for prior explicit selection and rapid visits stay ordered',async()=>{
  const f=fixture();await tick();f.pending.shift()!();await tick();
  f.swap('b');await tick();expect(f.posts).toEqual(['a','b']);
  f.d.querySelector('a')!.dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,button:0,cancelable:true}));
  await tick();expect(f.visits).toEqual([]);
  f.pending.shift()!();await tick();expect(f.visits).toEqual(['/projects/view?projectId=p']);
  await f.w.happyDOM.close();
 });
 test('popstate and URL/DOM mismatch never persist stale old panel',async()=>{
  const f=fixture();await tick();f.pending.shift()!();await tick();
  f.w.history.pushState({},'','/agent/b');f.w.dispatchEvent(new f.w.PopStateEvent('popstate'));
  f.live().resync();await tick();expect(f.posts).toEqual(['a']);
  f.swap('b');await tick();expect(f.posts).toEqual(['a','b']);f.pending.shift()!();await tick();
  await f.w.happyDOM.close();
 });
 test('modified clicks retain browser new-tab behavior',async()=>{
  const f=fixture();await tick();f.pending.shift()!();await tick();
  const event=new f.w.MouseEvent('click',{bubbles:true,button:0,ctrlKey:true,cancelable:true});f.d.querySelector('a')!.dispatchEvent(event);
  await tick();expect(event.defaultPrevented).toBe(false);expect(f.visits).toEqual([]);await f.w.happyDOM.close();
 });
});
