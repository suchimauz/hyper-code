import {expect,test} from 'bun:test';
import {Window} from 'happy-dom';
const source=await Bun.file(new URL('./$script_chat.js',import.meta.url)).text();
function fixture(width=390){
 const w=new Window({url:'http://local/agent/a',width}),d=w.document;
 w.requestAnimationFrame=()=>0;
 d.body.innerHTML='<section id="chat-panel" data-agent-id="a"><div id="messages">'+Array.from({length:8},(_,i)=>`<a href="#tool-${i}" class="tool tool-tucked ${i===1?'text-error':''}" data-tool="tool${i}">${i}</a>`).join('')+'<div id="active-tool-call"><a class="tool" data-tool="active">Active</a></div></div><form id="form" hx-post="/agent/a"><textarea id="input"></textarea></form></section>';
 w.eval(source);
 return {w,d};
}
test('tray keeps latest three, errors and active call visible; count button opens older calls to the left',async()=>{
 for(const width of [390,1280]){
  const f=fixture(width);try{
   const tray=f.d.querySelector('.tool-tray')!,toggle=tray.querySelector('button')!;
   expect(tray.firstElementChild).toBe(toggle);expect(toggle.textContent).toContain('8');expect(toggle.textContent).not.toContain('tool calls');
   expect(toggle.getAttribute('aria-expanded')).toBe('false');
   expect([...tray.querySelectorAll('.tool-latest')].map(t=>t.getAttribute('data-tool'))).toEqual(['tool5','tool6','tool7']);
   expect(tray.querySelectorAll('.tool-history')).toHaveLength(4);
   expect(tray.querySelector('.text-error')?.classList.contains('tool-history')).toBe(false);
   expect(tray.querySelector('#active-tool-call')).not.toBeNull();
   for(const t of tray.querySelectorAll('.tool-history'))expect(t.getAttribute('aria-hidden')).toBe('true');
   toggle.click();expect(toggle.getAttribute('aria-expanded')).toBe('true');expect(tray.classList.contains('tool-tray--folded')).toBe(false);
   expect(tray.querySelectorAll('[aria-hidden="true"].tool-history')).toHaveLength(0);
   toggle.click();expect(tray.classList.contains('tool-tray--folded')).toBe(true);
   toggle.click();expect(tray.classList.contains('tool-tray--folded')).toBe(false);
   const replacement=toggle.cloneNode(true) as HTMLElement;toggle.replaceWith(replacement);
   replacement.click();expect(tray.classList.contains('tool-tray--folded')).toBe(true);
   replacement.click();expect(tray.classList.contains('tool-tray--folded')).toBe(false);
   expect(f.d.querySelector('#input')).not.toBe(f.d.activeElement);
  }finally{await f.w.happyDOM.close();}
 }
});
