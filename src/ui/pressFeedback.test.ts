import {expect,test} from 'bun:test';
import {Window} from 'happy-dom';
const source=await Bun.file(new URL('./$script_pressFeedback.js',import.meta.url)).text();
function fixture(){
 const w=new Window({url:'https://local/agent/a'}),d=w.document;
 d.body.innerHTML='<div id="chat-panel"><div class="chat-composer"><div class="chat-box"><textarea id="input">Draft</textarea></div></div><button id="send"><i>Send</i></button><a class="tool" href="#tool">Tool</a><button id="disabled" disabled>No</button><button aria-disabled="true" id="unavailable">No</button></div><div id="nav-overlay"><a href="/agent/b" class="nav-row">Chat</a></div><div class="home-dashboard"><a id="dashboard-chat" href="/agent/b">Recent chat</a><a id="dashboard-card" href="/llms">Connections</a></div><button id="mobile-nav-button"><i>Menu</i></button><button id="outside">Other page</button>';
 const timers=new Map<number,()=>void>();let seq=0;
 w.setTimeout=((callback:()=>void)=>{timers.set(++seq,callback);return seq;}) as any;
 w.clearTimeout=((id:number)=>timers.delete(id)) as any;
 const flush=()=>{const list=[...timers.values()];timers.clear();list.forEach(fn=>fn());};
 w.eval(source);
 const pointer=(selector:string,type:string,patch={})=>{
  const e=new w.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:1,button:0,isPrimary:true,clientX:20,clientY:20,...patch});d.querySelector(selector)!.dispatchEvent(e);return e;
 };
 return {w,d,flush,pointer};
}
test('instant pointer-down feedback, minimum acknowledgement and release without synthetic clicks or focus',async()=>{
 const f=fixture();try{
  let clicks=0;f.d.getElementById('send')!.addEventListener('click',()=>clicks++);
  f.d.getElementById('input')!.focus();
  const e=f.pointer('#send i','pointerdown');
  expect(f.d.querySelector('#send')!.hasAttribute('data-ui-pressed')).toBe(true);expect(e.defaultPrevented).toBe(false);
  f.pointer('#send','pointerup');expect(f.d.querySelector('[data-ui-pressed]')).not.toBeNull();f.flush();
  expect(f.d.querySelector('[data-ui-pressed]')).toBeNull();expect(clicks).toBe(0);expect(f.d.activeElement?.id).toBe('input');
 }finally{await f.w.happyDOM.close();}
});
test('scrolling, pointer cancellation, switching targets and backgrounding never leave pressed state',async()=>{
 const f=fixture();try{
  f.pointer('.nav-row','pointerdown');f.pointer('.nav-row','pointermove',{clientY:45});expect(f.d.querySelector('[data-ui-pressed]')).toBeNull();
  for(const event of ['pointercancel','scroll','visibilitychange','htmx:before:swap']){
   f.pointer('.tool','pointerdown');f.d.dispatchEvent(new f.w.Event(event));expect(f.d.querySelector('[data-ui-pressed]')).toBeNull();
  }
  f.pointer('#send','pointerdown');f.pointer('.nav-row','pointerdown');expect(f.d.querySelectorAll('[data-ui-pressed]')).toHaveLength(1);
  f.w.dispatchEvent(new f.w.Event('blur'));expect(f.d.querySelector('[data-ui-pressed]')).toBeNull();
  f.pointer('#send','pointermove'); // A stray move without an active press is safe.
 }finally{await f.w.happyDOM.close();}
});
test('disabled, edit fields, secondary input and unrelated surfaces are untouched; live inserted controls work',async()=>{
 const f=fixture();try{
  for(const selector of ['#disabled','#unavailable','#outside']){f.pointer(selector,'pointerdown');expect(f.d.querySelector('[data-ui-pressed]')).toBeNull();}
  f.pointer('#send','pointerdown',{button:2});expect(f.d.querySelector('[data-ui-pressed]')).toBeNull();
  f.d.querySelector('#chat-panel')!.insertAdjacentHTML('beforeend','<button id="live">Live</button>');
  f.pointer('#live','pointerdown');expect(f.d.querySelector('#live')!.hasAttribute('data-ui-pressed')).toBe(true);
  f.w.eval(source);f.pointer('#send','pointerdown');expect(f.d.querySelectorAll('[data-ui-pressed]')).toHaveLength(1);
 }finally{await f.w.happyDOM.close();}
});
test('keyboard feedback leaves native activation intact and ignores composer text',async()=>{
 const f=fixture();try{
  const key=(id:string,type:string,key:string)=>{const e=new f.w.KeyboardEvent(type,{key,bubbles:true,cancelable:true});f.d.getElementById(id)!.dispatchEvent(e);return e;};
  expect(key('send','keydown','Enter').defaultPrevented).toBe(false);expect(f.d.querySelector('#send')!.hasAttribute('data-ui-pressed')).toBe(true);
  key('send','keyup','Enter');f.flush();expect(f.d.querySelector('[data-ui-pressed]')).toBeNull();
  key('input','keydown',' ');expect(f.d.querySelector('[data-ui-pressed]')).toBeNull();
  key('send','keydown',' ');key('send','keydown','Tab');expect(f.d.querySelector('[data-ui-pressed]')).toBeNull();
 }finally{await f.w.happyDOM.close();}
});

test('composer touch highlights its shell before focus; dashboard cards and rows acknowledge touch',async()=>{
 const f=fixture();try{
  const before=f.d.activeElement;
  const down=f.pointer('#input','pointerdown');
  expect(f.d.querySelector('.chat-box')!.hasAttribute('data-ui-pressed')).toBe(true);
  expect(f.d.activeElement).toBe(before);expect(down.defaultPrevented).toBe(false);
  f.pointer('#input','pointercancel');expect(f.d.querySelector('[data-ui-pressed]')).toBeNull();
  for(const id of ['#dashboard-chat','#dashboard-card','#mobile-nav-button i']){
   f.pointer(id,'pointerdown');expect(f.d.querySelector(id)!.closest('a, button')!.hasAttribute('data-ui-pressed')).toBe(true);
   f.pointer(id,'pointerup');f.flush();expect(f.d.querySelector('[data-ui-pressed]')).toBeNull();
  }
 }finally{await f.w.happyDOM.close();}
});
