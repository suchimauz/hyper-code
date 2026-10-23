import {expect,test} from 'bun:test';
import {Window} from 'happy-dom';
const source=await Bun.file(new URL('./$script_codeBlocks.js',import.meta.url)).text();
async function fixture(secure=false,width=390){
 const w=new Window({url:secure?'https://local/agent/a':'http://local/agent/a',width}),d=w.document;
 Object.defineProperty(w,'isSecureContext',{value:secure});
 d.body.innerHTML='<button id="origin">Copy</button><div id="messages"><div class="assistant"><pre data-code-language="typescript"><code><span>  const x = &lt;tag&gt;;</span>\n\t// Русский 😀\n</code></pre></div></div><textarea id="input">Draft</textarea>';
 w.eval(source);d.dispatchEvent(new w.Event('DOMContentLoaded'));await Promise.resolve();
 return {w,d,tick:async()=>{for(let i=0;i<10;i++)await Promise.resolve();}};
}
test('HTTP uses selected readonly fallback without altering source, selection, draft or keyboard focus',async()=>{
 const f=await fixture();try{
  const code=f.d.querySelector('code')!,expected=code.textContent;let copied='';
  const range=f.d.createRange();range.selectNodeContents(code);f.w.getSelection()!.addRange(range);
  const button=f.d.querySelector('[data-code-copy]') as any;button.focus();
  (f.d as any).execCommand=(command:string)=>{expect(command).toBe('copy');const field=f.d.querySelector('textarea[readonly]') as any;copied=field.value;expect(field.selectionEnd).toBe(copied.length);return true;};
  button.click();await f.tick();expect(copied).toBe(expected);expect(f.d.querySelector('.chat-code-status')!.textContent).toBe('Скопировано');
  expect(f.d.querySelector('textarea[readonly]')).toBeNull();expect(f.d.activeElement).toBe(button);
  expect(f.w.getSelection()!.toString()).toBe(expected);expect((f.d.querySelector('#input') as any).value).toBe('Draft');
 }finally{await f.w.happyDOM.close();}
});
test('desktop uses secure Clipboard API; denial falls back; total failure offers manual selection',async()=>{
 const f=await fixture(true,1280);try{
  let copied='';Object.defineProperty(f.w.navigator,'clipboard',{value:{writeText:async(t:string)=>{copied=t;}}});
  const button=f.d.querySelector('[data-code-copy]') as any;button.click();await f.tick();expect(copied).toBe(f.d.querySelector('code')!.textContent);
  f.w.navigator.clipboard.writeText=async()=>{throw Error('denied');};let fallback=0;
  (f.d as any).execCommand=()=>{fallback++;return true;};button.click();await f.tick();expect(fallback).toBe(1);
  (f.d as any).execCommand=()=>false;button.click();await f.tick();const manual=f.d.querySelector('[data-code-select]') as any;expect(manual.hidden).toBe(false);
  manual.click();expect(f.w.getSelection()!.toString()).toBe(f.d.querySelector('code')!.textContent);
 }finally{await f.w.happyDOM.close();}
});
test('live enhancements remain idempotent; language, horizontal scrolling and collapse preserve source',async()=>{
 const f=await fixture();try{
  const pre=f.d.querySelector('pre')!;expect(pre.tabIndex).toBe(0);expect(f.d.querySelector('.chat-code-language')!.textContent).toBe('typescript');
  f.w.eval(source);f.d.dispatchEvent(new f.w.Event('htmx:after:swap'));expect(f.d.querySelectorAll('[data-code-copy]')).toHaveLength(1);
  const next=f.d.createElement('pre');next.innerHTML='<code class="language-json"></code>';next.querySelector('code')!.textContent=Array(25).fill('{"x": 1}').join('\n');f.d.querySelector('.assistant')!.append(next);
  f.d.dispatchEvent(new f.w.Event('htmx:after:process'));expect(f.d.querySelectorAll('[data-code-copy]')).toHaveLength(2);
  expect(next.closest('[data-chat-code-block]')!.getAttribute('data-code-collapsed')).toBe('true');
  const original=next.textContent;(next.closest('[data-chat-code-block]')!.querySelector('[data-code-toggle]') as any).click();expect(next.textContent).toBe(original);
 }finally{await f.w.happyDOM.close();}
});
