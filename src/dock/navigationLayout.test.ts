import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
const script = await Bun.file(new URL('./$script_dock.js', import.meta.url)).text();
async function fixture(saved = false, width = 1280, height = 900, bands = 1) {
 const win = new Window({url:'http://localhost/',width,height});
 win.document.body.innerHTML = `<div id="frame"><nav id="dock"><button data-action="toggle-sidebar"></button><div id="project-sidebar"></div><div class="dock-footer"><div id="dock-limits-home"><section id="dock-limits"><div id="quota-rings">${'<div class="quota-matrix-band"></div>'.repeat(bands)}</div></section></div></div></nav><section id="page-view"></section><aside id="dock-limits-shelf"></aside></div>`;
 const nav=win.document.getElementById('dock')!;
 Object.defineProperty(nav,'clientHeight',{get:()=>height});
 win.document.querySelectorAll('.quota-matrix-band').forEach(el=>{el.getBoundingClientRect=()=>({height:110}) as DOMRect});
 (win as any).hyperLive={subscribe:()=>{}};
 win.localStorage.setItem('hyper:sidebar-collapsed',String(saved));
 win.eval(script); win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
 return win;
}
test('compact rail moves the same live quota node, retains focus semantics and restores it',async()=>{
 const w=await fixture();try {
  const panel=w.document.getElementById('dock-limits')!;
  const toggle=w.document.querySelector('[data-action="toggle-sidebar"]') as any;
  expect(panel.parentElement!.id).toBe('dock-limits-home');toggle.click();
  expect(panel.parentElement!.id).toBe('dock-limits-shelf');expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(w.localStorage.getItem('hyper:sidebar-collapsed')).toBe('true');
  toggle.click();expect(panel.parentElement!.id).toBe('dock-limits-home');
  expect(w.document.querySelectorAll('#quota-rings').length).toBe(1);
 } finally {await w.happyDOM.close()}
});
test('restored compact state and large connection inventories keep quotas in the wide shelf',async()=>{
 for(const [saved,bands] of [[true,1],[false,8]] as const){const w=await fixture(saved,1280,900,bands);try{
  expect(w.document.getElementById('dock-limits')!.parentElement!.id).toBe('dock-limits-shelf');
  expect(w.document.getElementById('frame')!.classList.contains('limits-detached')).toBe(true);
 }finally{await w.happyDOM.close()}}
});
test('mobile leaves desktop quotas in their home; mobile usage keeps its existing surface',async()=>{
 const w=await fixture(true,390,844);try{
  expect(w.document.getElementById('dock-limits')!.parentElement!.id).toBe('dock-limits-home');
  expect(w.document.getElementById('frame')!.classList.contains('limits-detached')).toBe(false);
 }finally{await w.happyDOM.close()}
});
test('compact rail works immediately above the existing 700px mobile breakpoint',async()=>{
 const w=await fixture(true,720,900);try{
  expect(w.document.getElementById('dock-limits')!.parentElement!.id).toBe('dock-limits-shelf');
  expect(w.document.getElementById('dock')!.classList.contains('dock-collapsed')).toBe(true);
 }finally{await w.happyDOM.close()}
});
