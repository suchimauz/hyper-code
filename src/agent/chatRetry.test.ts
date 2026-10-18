import {test,expect} from 'bun:test';
import {Window} from 'happy-dom';
const source=await Bun.file(new URL('./$script_chat.js',import.meta.url)).text();
function fixture(){
 const w=new Window({url:'http://local/agent/a'}),d=w.document;(w as any).requestAnimationFrame=()=>0;
 const panel='<section id="chat-panel"><div id="messages"></div><form id="form" hx-post="/agent/a"><div data-chat-network hidden></div><div data-chat-send-error hidden><span data-chat-send-error-text></span><button type="button" data-chat-retry>Retry</button><button type="button" data-chat-cancel-retry>Cancel</button></div><input name="requestId"><input id="files" type="file" multiple><div data-attachments></div><textarea id="input"></textarea></form></section>';
 d.body.innerHTML='<main>'+panel+'</main>';w.eval(source);
 const form=()=>d.querySelector('#form') as any,input=()=>d.querySelector('#input') as any,files=()=>d.querySelector('#files') as any;
 const type=(s:string)=>{input().value=s;input().dispatchEvent(new w.Event('input'));};
 const send=()=>form().dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
 const retry=()=> (d.querySelector('[data-chat-retry]') as any).click();
 const finish=(status:number,event='htmx:after:request')=>form().dispatchEvent(new w.CustomEvent(event,{detail:{ctx:{sourceElement:form(),response:{status}}}}));
 const body=()=>{const body=new w.FormData(form());form().dispatchEvent(new w.CustomEvent('htmx:config:request',{detail:{ctx:{sourceElement:form(),request:{body}}}}));return body;};
 const select=(f:any)=>{const dt=new w.DataTransfer();dt.items.add(f);files().files=dt.files;files().dispatchEvent(new w.Event('change'));};
 return {w,d,form,input,files,type,send,retry,finish,body,select,panel};
}
test('offline is calm, online never resends; retry uses original snapshot and stable key even when busy',async()=>{
 const f=fixture();Object.defineProperty(f.w.navigator,'onLine',{configurable:true,value:false});f.type('first');expect(f.send()).toBe(false);expect(f.d.querySelector('[data-chat-network]')!.hasAttribute('hidden')).toBe(false);
 f.type('new draft');Object.defineProperty(f.w.navigator,'onLine',{configurable:true,value:true});f.w.dispatchEvent(new f.w.Event('online'));expect(f.form().hasAttribute('data-chat-submitting')).toBe(false);
 f.form().insertAdjacentHTML('beforeend','<div data-composer-running-controls></div>');f.retry();const first=f.body();expect(first.get('text')).toBe('first');expect(f.send()).toBe(false);f.finish(500);f.retry();expect(f.body().get('requestId')).toBe(first.get('requestId'));expect(f.body().get('text')).toBe('first');f.finish(204);expect(f.input().value).toBe('new draft');await f.w.happyDOM.close();
});
test('network exception/finally unlock, same File objects survive retry, success removes only sent files',async()=>{
 const f=fixture();const one=new f.w.File(['a'],'a.txt');f.select(one);f.type('original');f.send();const first=f.body();f.finish(0,'htmx:error');expect(f.form().hasAttribute('data-chat-submitting')).toBe(false);f.finish(0,'htmx:finally:request');
 const next=new f.w.File(['b'],'b.txt');f.select(next);f.type('next');f.retry();expect(f.body().get('requestId')).toBe(first.get('requestId'));expect((f.body().get('files') as any).name).toBe('a.txt');f.finish(200);expect(f.files().files[0]).toBe(next);expect(f.input().value).toBe('next');await f.w.happyDOM.close();
});
test('failed payload survives navigation, new draft not mistaken for sent payload',async()=>{
 const f=fixture();f.type('old');f.send();const key=f.body().get('requestId');f.finish(500);f.type('edited');const main=f.d.querySelector('main')!;main.dispatchEvent(new f.w.Event('htmx:before:cleanup',{bubbles:true}));main.innerHTML=f.panel;f.d.dispatchEvent(new f.w.CustomEvent('htmx:after:swap',{detail:{ctx:{target:main}}}));f.retry();expect(f.body().get('requestId')).toBe(key);expect(f.body().get('text')).toBe('old');f.finish(204);expect(f.input().value).toBe('edited');await f.w.happyDOM.close();
});
test('invalid400 can explicitly abandon retry without losing edited draft; next send has fresh key',async()=>{
 const f=fixture();f.type('invalid');f.send();const key=f.body().get('requestId');f.finish(400);f.type('corrected');(f.w as any).confirm=()=>false;(f.d.querySelector('[data-chat-cancel-retry]') as any).click();expect(f.send()).toBe(false);(f.w as any).confirm=()=>true;(f.d.querySelector('[data-chat-cancel-retry]') as any).click();expect(f.input().value).toBe('corrected');expect(f.send()).toBe(true);expect(f.body().get('requestId')).not.toBe(key);expect(f.body().get('text')).toBe('corrected');await f.w.happyDOM.close();
});
