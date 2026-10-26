import {afterEach,describe,expect,test} from 'bun:test';
import {Window} from 'happy-dom';
import render from './renderChrome';
import button from '../procs/ui/button';
import popup from '../ui/popup';
import action from './$route_action_POST';
const source=await Bun.file(new URL('./$script_reorder.js',import.meta.url)).text();
const navigation=await Bun.file(new URL('./$script_navigation.js',import.meta.url)).text();
const windows:Window[]=[];
afterEach(async()=>{for(const w of windows.splice(0))await w.happyDOM.close();});
const tick=async()=>{for(let i=0;i<60;i++)await Promise.resolve();await new Promise(r=>setTimeout(r,1));for(let i=0;i<30;i++)await Promise.resolve();};
const ctx:any={fns:{procs:{ui:{escape:({text}:any)=>Bun.escapeHTML(text),attr:()=>''}},chat:{icon:()=>'<img alt="" src="data:,">'},ui:{}}};
ctx.fns.procs.ui.button=(o:any)=>button(ctx,null,o);ctx.fns.ui.popup=(o:any)=>popup(ctx,null,o);
async function markup(projectIds=['p','q','r'],tabIds=['a','b','c']){
 return render(ctx,null,{projects:projectIds.map(id=>({id,title:id,dir:'/'+id,host:''})),projectId:'p',activeId:'a',chats:tabIds.map(id=>({id,title:id,runState:'idle'})),tabIds});
}
async function fixture(withNavigation=false){
 const w=new Window({url:'http://local/agent/a'});windows.push(w);
 const d=w.document, html=await markup();
 d.head.innerHTML='<meta name="csrf-token" content="test-csrf">';
 d.body.innerHTML='<aside id="project-sidebar">'+html.sidebar+'</aside><main id="main"><div id="project-tabs-host">'+html.tabs+'</div><div id="chat-panel" data-agent-id="a"></div></main>';
 const posts:any[]=[],visits:string[]=[],pending:Array<()=>void>=[];
 let defer=false,fail=false,getCount=0,live:any,projectIds=['p','q','r'],tabIds=['a','b','c'];
 (w as any).fetch=async(url:string,o:any)=>{
  if(o?.method==='POST'){
   const body=JSON.parse(o.body);posts.push({body,headers:o.headers});
   if(defer)await new Promise<void>(r=>pending.push(r));
   if(fail)return {ok:false,json:async()=>({ok:false,error:'Order changed in another window'})};
   if(body.projectIds)projectIds=body.projectIds;if(body.tabIds)tabIds=body.tabIds;
   return {ok:true,json:async()=>({ok:true})};
  }
  getCount++; const out=await markup(projectIds,tabIds);return {ok:true,json:async()=>out};
 };
 (w as any).htmx={process:()=>{},ajax:async(_v:string,url:string)=>{visits.push(url);}};
 (w as any).hyperLive={subscribe:(o:any)=>{live=o;}};
 w.eval(source);if(withNavigation)w.eval(navigation);await tick();
 const list=(kind:string)=>d.querySelector('[data-project-order="'+kind+'"]')!;
 const order=(kind:string)=>[...list(kind).children].map(el=>(el as any).dataset.reorderId);
 const item=(kind:string,id:string)=>[...list(kind).children].find(el=>(el as any).dataset.reorderId===id)!;
 const geometry=(kind:string,wrap=false)=>{
  [...list(kind).children].forEach((el,i)=>{const x=kind==='projects'?0:(i%2)*110,y=kind==='projects'?i*50:wrap?Math.floor(i/2)*40:0;
   (el as any).getBoundingClientRect=()=>({left:x,top:y,right:x+100,bottom:y+35,width:100,height:35});
  });
 };
 const transfer={clearData:()=>{},setData:()=>{},effectAllowed:'',dropEffect:''};
 const event=(type:string,target:any,x=0,y=0)=>{
  const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y});Object.defineProperty(e,'dataTransfer',{value:transfer});target.dispatchEvent(e);return e;
 };
 const drag=(kind:string,id:string,to:string,x:number,y:number)=>{geometry(kind,true);event('dragstart',item(kind,id));event('dragover',item(kind,to),x,y);event('drop',item(kind,to),x,y);event('dragend',item(kind,id));};
 return {w,d,posts,visits,pending,list,order,item,geometry,event,drag,defer:(v:boolean)=>defer=v,fail:(v:boolean)=>fail=v,gets:()=>getCount,live:()=>live};
}
describe('safe project and desktop tab reordering',()=>{
 test('renders through the real shared button allowlist; only desktop rows become draggable',async()=>{
  const f=await fixture();
  expect(f.item('projects','p').getAttribute('draggable')).toBe('true');
  expect(f.item('tabs','a').getAttribute('draggable')).toBe('true');
  expect(f.item('tabs','a').querySelector('a')!.getAttribute('draggable')).toBe('false');
  expect(f.d.querySelector('.project-mobile-bar [draggable]')).toBeNull();
  expect(f.item('projects','p').getAttribute('aria-describedby')).toBe('project-reorder-help');
 });
 test('moves projects downward and upward with a visible marker and exact CSRF-protected payload',async()=>{
  const f=await fixture();f.geometry('projects');
  f.event('dragstart',f.item('projects','p'));f.event('dragover',f.item('projects','r'),30,130);
  expect(f.d.querySelector('.project-drop-marker')).not.toBeNull();
  f.event('drop',f.item('projects','r'),30,130);await tick();
  expect(f.order('projects')).toEqual(['q','r','p']);
  expect(f.posts[0]).toEqual({body:{action:'reorder-projects',projectIds:['q','r','p']},headers:{'Content-Type':'application/json',Accept:'application/json','X-CSRF-Token':'test-csrf'}});
  expect(f.d.querySelector('.project-drop-marker')).toBeNull();
  f.drag('projects','p','q',30,1);await tick();expect(f.order('projects')).toEqual(['p','q','r']);
 });
 test('moves tabs across wrapped rows without selecting, closing, or navigating',async()=>{
  const f=await fixture();f.drag('tabs','a','c',90,60);await tick();
  expect(f.order('tabs')).toEqual(['b','c','a']);expect(f.posts[0].body).toEqual({action:'reorder-tabs',projectId:'p',tabIds:['b','c','a']});
  expect(f.item('tabs','a').classList.contains('selected')).toBe(true);expect(f.visits).toEqual([]);
 });
 test('cancel, no-op, external drop, cross-list drop and action controls never persist',async()=>{
  const f=await fixture();f.geometry('projects');
  f.event('drop',f.item('projects','q'),5,60);
  f.event('dragstart',f.item('projects','p'));f.event('dragover',f.item('tabs','b'),150,10);f.event('drop',f.item('tabs','b'),150,10);f.event('dragend',f.item('projects','p'));
  f.event('dragstart',f.item('projects','p'));f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  f.drag('projects','p','p',20,10);
  expect(f.event('dragstart',f.item('tabs','a').querySelector('button')).defaultPrevented).toBe(true);
  await tick();expect(f.posts).toEqual([]);expect(f.order('projects')).toEqual(['p','q','r']);
 });
 test('failure restores order, reports error, releases lock and permits retry',async()=>{
  const f=await fixture();let error='';f.d.addEventListener('projects:reorder-error',(e:any)=>error=e.detail.message);f.fail(true);
  f.drag('projects','p','r',10,130);await tick();expect(f.order('projects')).toEqual(['p','q','r']);expect(error).toContain('another window');expect(f.list('projects').hasAttribute('aria-busy')).toBe(false);
  f.fail(false);f.drag('projects','p','r',10,130);await tick();expect(f.order('projects')).toEqual(['q','r','p']);
 });
 test('keyboard alternative preserves focus and ordinary modified clicks',async()=>{
  const f=await fixture();const link=f.item('tabs','b').querySelector('a') as any;link.focus();
  link.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,shiftKey:true,bubbles:true,cancelable:true}));await tick();
  expect(f.order('tabs')).toEqual(['b','a','c']);expect(f.d.activeElement).toBe(link);
  const click=new f.w.MouseEvent('click',{button:0,ctrlKey:true,bubbles:true,cancelable:true});link.dispatchEvent(click);expect(click.defaultPrevented).toBe(false);
 });
 test('live refresh waits through drag and save; navigation waits for persistence',async()=>{
  const f=await fixture(true);expect(f.posts.map(x=>x.body.action)).toEqual(['select']);
  f.defer(true);const before=f.gets();f.geometry('projects');f.event('dragstart',f.item('projects','p'));f.live().resync();await tick();expect(f.gets()).toBe(before);
  f.event('dragover',f.item('projects','r'),10,130);f.event('drop',f.item('projects','r'),10,130);await tick();
  f.live().resync();await new Promise(r=>setTimeout(r,1));f.item('projects','q').dispatchEvent(new f.w.MouseEvent('click',{button:0,bubbles:true,cancelable:true}));await tick();
  expect(f.gets()).toBe(before);expect(f.visits).toEqual([]);
  f.pending.shift()!();await tick();expect(f.visits).toEqual(['/projects/view?projectId=q']);expect(f.order('projects')).toEqual(['q','r','p']);
  expect(f.posts.filter(x=>x.body.action==='reorder-projects')).toHaveLength(1);
 });
 test('delegated handlers survive refresh; one script installation; focus survives navigation morph',async()=>{
  const f=await fixture(true);f.w.eval(source);const link=f.item('tabs','b').querySelector('a') as any;link.focus();
  link.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,shiftKey:true,bubbles:true,cancelable:true}));await tick();
  expect(f.order('tabs')).toEqual(['b','a','c']);expect(f.d.activeElement?.closest('[data-reorder-id]')?.getAttribute('data-reorder-id')).toBe('b');
  expect(f.posts.filter(x=>x.body.action==='reorder-tabs')).toHaveLength(1);
  expect(f.item('tabs','b').getAttribute('draggable')).toBe('true');
 });
});
describe('reorder HTTP boundaries',()=>{
 test('authorizes project and dispatches exact arrays without selecting a chat',async()=>{
  const calls:any[]=[];const c:any={fns:{auth:{verifyCsrf:async()=>true},projects:{get:async()=>({id:'p'}),reorder:async(o:any)=>{calls.push(o);return {tabIds:o.tabIds,activeId:'a'};},reorderProjects:async(o:any)=>{calls.push(o);return o.projectIds;}}}};
  for(const body of [{action:'reorder-tabs',projectId:'p',tabIds:['b','a']},{action:'reorder-projects',projectIds:['q','p']}]){
   const r=await action(c,null,{req:new Request('http://local/projects/action',{method:'POST',body:JSON.stringify(body)})});expect(r.status).toBe(200);
  }
  expect(calls).toEqual([{projectId:'p',tabIds:['b','a']},{projectIds:['q','p']}]);
  c.fns.auth.verifyCsrf=async()=>false;expect((await action(c,null,{req:new Request('http://local',{method:'POST',body:'{}'})})).status).toBe(403);expect(calls).toHaveLength(2);
 });
 test('rejects malformed order and inaccessible project before persistence',async()=>{
  const c:any={fns:{auth:{verifyCsrf:async()=>true},projects:{get:async()=>null,reorderProjects:()=>{throw Error('MUST NOT WRITE');}}}};
  for(const body of [{action:'reorder-tabs',projectId:'foreign',tabIds:['a']},...['bad',null,['a','a'],[1],['']].map(projectIds=>({action:'reorder-projects',projectIds}))]){
   const r=await action(c,null,{req:new Request('http://local',{method:'POST',body:JSON.stringify(body)})});expect(r.status).toBe(400);expect(((await r.json()) as {error:string}).error).not.toContain('MUST NOT WRITE');
  }
 });
});
