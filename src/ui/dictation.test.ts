import {test,expect} from 'bun:test';
import {Window} from 'happy-dom';
const source=await Bun.file(new URL('./$script_dictation.js',import.meta.url)).text();
const tick=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture(){
 const w=new Window({url:'https://hyper.test/agent/a'});const d=w.document;
 d.body.innerHTML='<form><textarea name="text">Draft</textarea><button type="button" data-dictate><i></i></button><div data-dictation-bar hidden><span data-dictation-status></span><button type="button" data-dictation-cancel></button></div></form>';
 Object.defineProperty(w,'isSecureContext',{value:true});let stopped=0,requests=0,submitted=0;let done:any;const stream={getTracks:()=>[{stop:()=>stopped++}]};
 Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>stream},configurable:true});
 class Recorder extends w.EventTarget {static isTypeSupported(){return true;}state='inactive';mimeType='audio/webm';start(){this.state='recording';}stop(){this.state='inactive';const e=new w.Event('dataavailable');(e as any).data=new w.Blob(['audio']);this.dispatchEvent(e);this.dispatchEvent(new w.Event('stop'));}}
 (w as any).MediaRecorder=Recorder;(w as any).fetch=async()=>{requests++;return await new Promise(r=>done=r);};
 d.querySelector('form')!.addEventListener('submit',()=>submitted++);w.eval(source);
 return {w,d,mic:()=> (d.querySelector('[data-dictate]') as any).click(),cancel:()=> (d.querySelector('[data-dictation-cancel]') as any).click(),input:d.querySelector('textarea')!,status:()=>d.querySelector('[data-dictation-status]')!.textContent,stopped:()=>stopped,requests:()=>requests,submitted:()=>submitted,resolve:(text:string)=>done({ok:true,json:async()=>({text})})};
}
test('dictation adds to latest draft without submitting, stops microphone',async()=>{const f=fixture();f.mic();await tick();expect(f.requests()).toBe(0);expect(f.status()).toContain('Идёт запись');f.mic();await tick();expect(f.stopped()).toBe(1);expect(f.requests()).toBe(1);f.input.value='Edited draft';f.resolve('Распознанная речь');await tick();expect(f.input.value).toBe('Edited draft Распознанная речь');expect(f.submitted()).toBe(0);await f.w.happyDOM.close();});
test('cancel recording never uploads or edits draft',async()=>{const f=fixture();f.mic();await tick();f.cancel();await tick();expect(f.stopped()).toBe(1);expect(f.requests()).toBe(0);expect(f.input.value).toBe('Draft');await f.w.happyDOM.close();});
test('navigation discards late transcript and closes mic',async()=>{const f=fixture();f.mic();await tick();f.mic();await tick();f.d.querySelector('form')!.dispatchEvent(new f.w.Event('htmx:before:cleanup',{bubbles:true}));f.resolve('Do not append');await tick();expect(f.input.value).toBe('Draft');expect(f.submitted()).toBe(0);await f.w.happyDOM.close();});
test('permission denial is visible and cannot submit',async()=>{const f=fixture();Object.defineProperty(f.w.navigator,'mediaDevices',{value:{getUserMedia:async()=>{throw new f.w.DOMException('denied','NotAllowedError');}}});f.mic();await tick();expect(f.status()).toContain('запрещён');expect(f.requests()).toBe(0);await f.w.happyDOM.close();});
test('permission resolving after cancellation releases tracks',async()=>{const f=fixture();let ready:any;let stops=0;Object.defineProperty(f.w.navigator,'mediaDevices',{value:{getUserMedia:()=>new Promise(r=>ready=r)}});f.mic();await tick();f.cancel();ready({getTracks:()=>[{stop:()=>stops++}]});await tick();expect(stops).toBe(1);expect(f.requests()).toBe(0);await f.w.happyDOM.close();});
