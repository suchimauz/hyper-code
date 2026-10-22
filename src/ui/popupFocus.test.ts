import {expect,test} from 'bun:test';
import {Window} from 'happy-dom';
const source=await Bun.file(new URL('./$script_popup.js',import.meta.url)).text();
function fixture(touch=true){
 const w=new Window({url:'http://local/agent/a',width:touch?390:1280});
 const d=w.document;
 w.matchMedia=((query:string)=>({matches:touch&&query==='(pointer: coarse)'})) as any;
 d.body.innerHTML='<button id="tool">Tool details</button><textarea id="input">Unsent draft</textarea><dialog id="app-popup"><section><h2 id="app-popup-title"></h2><button id="app-popup-close">Close</button><div id="app-popup-body"></div></section></dialog>';
 const dialog=d.getElementById('app-popup') as any;
 let nativeReturn:any;
 // Model the native dialog focus restoration as well as our explicit restoration.
 dialog.showModal=()=>{nativeReturn=d.activeElement;dialog.open=true;d.getElementById('app-popup-close')!.focus();};
 dialog.close=()=>{dialog.open=false;nativeReturn?.focus();dialog.dispatchEvent(new w.Event('close'));};
 (w as any).hyperLive={subscribe:()=>{}};
 w.eval(source);
 return {w,d,dialog,popup:(w as any).hyperPopup};
}
test('phone tool close never restores composer focus, including native dialog restoration',async()=>{
 const f=fixture();try{
  const input=f.d.getElementById('input') as any;
  input.focus();input.setSelectionRange(2,5);
  let focus=0;input.addEventListener('focus',()=>focus++);
  f.popup.content('<pre>Arguments and result</pre>','Tool','tool');
  f.d.getElementById('app-popup-close')!.click();
  expect(f.dialog.open).toBe(false);expect(focus).toBe(0);
  expect(f.d.activeElement).not.toBe(input);expect(input.value).toBe('Unsent draft');
  expect([input.selectionStart,input.selectionEnd]).toEqual([2,5]);
 }finally{await f.w.happyDOM.close();}
});
test('phone restores tool trigger; detached trigger never falls back to the composer; Escape uses same path',async()=>{
 const f=fixture();try{
  const tool=f.d.getElementById('tool')!;tool.focus();f.popup.open('Tool','tool');
  f.popup.close();expect(f.d.activeElement).toBe(tool);
  tool.focus();f.popup.open('Tool','tool');tool.remove();
  f.dialog.dispatchEvent(new f.w.Event('cancel',{cancelable:true}));
  expect(f.dialog.open).toBe(false);expect(f.d.activeElement?.id).not.toBe('input');
 }finally{await f.w.happyDOM.close();}
});
test('desktop retains composer restoration and direct native closure is cleaned up',async()=>{
 const f=fixture(false);try{
  const input=f.d.getElementById('input')!;input.focus();f.popup.open('Tool','tool');
  f.dialog.close();expect(f.d.activeElement).toBe(input);expect(f.dialog.dataset.popupKind).toBeUndefined();
  f.popup.open('Tool','tool');f.popup.close();expect(f.d.activeElement).toBe(input);
 }finally{await f.w.happyDOM.close();}
});
test('secure prompt Escape still delegates cancellation rather than silently closing',async()=>{
 const f=fixture();try{
  let cancelled=0;f.popup.content('<button data-secure-cancel>Cancel</button>','Login','secure-input');
  f.d.querySelector('[data-secure-cancel]')!.addEventListener('click',()=>cancelled++);
  f.dialog.dispatchEvent(new f.w.Event('cancel',{cancelable:true}));
  expect(cancelled).toBe(1);expect(f.dialog.open).toBe(true);
 }finally{await f.w.happyDOM.close();}
});
