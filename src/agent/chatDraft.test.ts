import {test,expect} from 'bun:test';
import {Window} from 'happy-dom';
const source=await Bun.file(new URL('./$script_chat.js',import.meta.url)).text();
function fixture(blocked=false){
 const w=new Window({url:'http://local/agent/a'});const d=w.document;
 (w as any).requestAnimationFrame=()=>0;
 if(blocked)Object.defineProperty(w,'sessionStorage',{get(){throw Error('blocked')}});
 (w as any).console.debug=()=>{};
 const panel=(id:string)=>`<section id="chat-panel" data-agent-id="${id}"><div id="messages" data-agent-id="${id}"></div><form id="form" hx-post="/agent/${id}"><button type="button" data-chat-retry></button><input name="requestId"><input id="files" type="file"><div data-attachments></div><textarea id="input"></textarea></form></section>`;
 d.body.innerHTML='<main id="main">'+panel('a')+'</main>';w.eval(source);
 const input=()=>d.querySelector('#input') as any;
 const type=(text:string)=>{input().value=text;input().dispatchEvent(new w.Event('input',{bubbles:true}));};
 const navigate=(id:string|null)=>{const main=d.querySelector('#main')!;main.dispatchEvent(new w.Event('htmx:before:cleanup',{bubbles:true}));main.innerHTML=id?panel(id):'<p>Other page</p>';d.dispatchEvent(new w.CustomEvent('htmx:after:swap',{detail:{ctx:{target:main}}}));};
 const send=(status:number,newText?:string)=>{const form=d.querySelector('#form')!;if(form.hasAttribute('data-chat-send-failed'))(form.querySelector('[data-chat-retry]') as any).click();else form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));if(newText!==undefined)type(newText);form.dispatchEvent(new w.CustomEvent('htmx:after:request',{bubbles:true,detail:{ctx:{sourceElement:form,response:{status}}}}));};
 return {w,d,input,type,navigate,send};
}
test('chat drafts remain independent across tabs and non-chat pages, including caret',async()=>{
 const f=fixture();f.type('Первый\nчерновик');f.input().setSelectionRange(2,5);f.navigate('b');expect(f.input().value).toBe('');f.type('Second');f.navigate(null);f.navigate('a');expect(f.input().value).toBe('Первый\nчерновик');expect(f.input().selectionStart).toBe(2);expect(f.input().selectionEnd).toBe(5);f.navigate('b');expect(f.input().value).toBe('Second');await f.w.happyDOM.close();
});
test('storage survives controller reload, and clearing text removes saved draft',async()=>{
 const f=fixture();f.type('Persist');const saved=f.w.sessionStorage.getItem('hyper:chat-draft:v1:/agent/a');expect(JSON.parse(saved!).text).toBe('Persist');f.navigate('b');f.w.sessionStorage.setItem('hyper:chat-draft:v1:/agent/reloaded',saved!);f.navigate('reloaded');expect(f.input().value).toBe('Persist');f.type('');f.navigate('b');f.navigate('reloaded');expect(f.input().value).toBe('');await f.w.happyDOM.close();
});
test('failed sends retain drafts, successful sends clear only the sent text',async()=>{
 const f=fixture();f.type('Retry');f.send(500);f.navigate('b');f.navigate('a');expect(f.input().value).toBe('Retry');f.send(200);expect(f.input().value).toBe('');f.navigate('b');f.navigate('a');expect(f.input().value).toBe('');f.type('Sending');f.send(200,'Next message');f.navigate('b');f.navigate('a');expect(f.input().value).toBe('Next message');await f.w.happyDOM.close();
});
test('send completion after leaving the chat clears the original draft, not another chat',async()=>{
 const f=fixture();f.type('Sent elsewhere');const form=f.d.querySelector('#form')!;form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));f.navigate('b');f.type('Keep B');form.dispatchEvent(new f.w.CustomEvent('htmx:after:request',{bubbles:true,detail:{ctx:{sourceElement:form,response:{status:200}}}}));expect(f.input().value).toBe('Keep B');f.navigate('a');expect(f.input().value).toBe('');await f.w.happyDOM.close();
});
test('storage blocked still preserves drafts during in-page navigation',async()=>{
 const f=fixture(true);f.type('Memory');f.navigate('b');f.navigate('a');expect(f.input().value).toBe('Memory');await f.w.happyDOM.close();
});
