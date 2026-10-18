import {test,expect} from 'bun:test';
import {Window} from 'happy-dom';
const source=await Bun.file(new URL('./$script_chatSearch.js',import.meta.url)).text();
function setup(){const w=new Window({url:'http://localhost'});w.document.body.innerHTML='<div id="messages"></div><textarea id="input">draft unchanged</textarea><button data-chat-search="mine">search</button>';w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLElement.prototype.scrollIntoView=function(){};w.eval(source);return w;}
const tick=()=>new Promise(r=>setTimeout(r,10));
test('literal highlighting, previous/next, close retains original chat nodes/draft/scroll',async()=>{
 const w=setup(), d=w.document, messages=d.querySelector('#messages')!;messages.scrollTop=123;
 w.fetch=async()=>({ok:true,json:async()=>({results:[{idx:1,role:'user',snippet:'hello <img> %_',truncated:false},{idx:2,role:'assistant',snippet:'second %_',truncated:false}],next:null})}) as any;
 (d.querySelector('[data-chat-search]') as any).click();const input=d.querySelector('input')!;input.value='%_';d.querySelector('form')!.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
 expect(d.querySelectorAll('mark').length).toBeGreaterThan(0);expect(d.querySelector('dialog img')).toBeNull();
 (d.querySelectorAll('nav button')[1] as any).click();expect(d.querySelector('article pre')!.textContent).toBe('second %_');
 (d.querySelectorAll('nav button')[0] as any).click();expect(d.querySelector('article pre')!.textContent).toBe('hello <img> %_');
 messages.scrollTop=900;(d.querySelector('header button') as any).click();expect(d.querySelector('dialog')).toBeNull();expect(d.querySelector('#messages')).toBe(messages);expect(messages.scrollTop).toBe(123);expect((d.querySelector('#input') as any).value).toBe('draft unchanged');w.close();
});
test('late request completion cannot reopen closed dialog, no duplicate global installation',async()=>{
 const w=setup(),d=w.document;let resolve:any;w.fetch=()=>new Promise(r=>resolve=r) as any;
 w.eval(source);(d.querySelector('[data-chat-search]') as any).click();expect(d.querySelectorAll('dialog').length).toBe(1);
 d.querySelector('input')!.value='one';d.querySelector('form')!.dispatchEvent(new w.Event('submit',{cancelable:true}));
 d.querySelector('dialog')!.dispatchEvent(new w.Event('cancel',{cancelable:true}));resolve({ok:true,json:async()=>({results:[],next:null})});await tick();expect(d.querySelector('dialog')).toBeNull();w.close();
});
test('runtime before:swap closes only on chat navigation, not live message updates',()=>{
 const w=setup(),d=w.document;(d.querySelector('[data-chat-search]') as any).click();
 d.dispatchEvent(new w.CustomEvent('htmx:before:swap',{detail:{ctx:{target:d.querySelector('#messages')}}}));expect(d.querySelectorAll('dialog').length).toBe(1);
 d.dispatchEvent(new w.CustomEvent('htmx:before:swap',{detail:{ctx:{target:d.body}}}));expect(d.querySelector('dialog')).toBeNull();w.close();
});
