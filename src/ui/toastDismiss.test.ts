import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import controlScript from './controlScript';

test('explicit toast dismissal works while hovered and with details; keyboard also closes', async () => {
 const window = new Window({url:'http://localhost/'});
 try {
  (window as any).hyperLive = {subscribe:()=>{},command:()=>{}};
  window.eval(await controlScript({} as Context,null,{}));
  const toast=(window as any).toast;
  toast({message:'Ошибка',level:'error',body:'Подробности'});
  const box=window.document.querySelector('#toasts > div')!;
  box.dispatchEvent(new window.Event('mouseenter'));
  box.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
  expect(box.classList.contains('opacity-0')).toBe(true);
  await new Promise(r=>setTimeout(r,250));
  expect(box.isConnected).toBe(false);
  toast({message:'Готово'});
  const next=window.document.querySelector('#toasts > div')!;
  next.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await new Promise(r=>setTimeout(r,250));
  expect(next.isConnected).toBe(false);
 } finally {await window.happyDOM.close();}
});
