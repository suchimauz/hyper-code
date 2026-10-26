import {test,expect} from 'bun:test';
import {Window} from 'happy-dom';
const script=await Bun.file(new URL('./$script_quotaTip.js',import.meta.url)).text();
test('reset detail uses browser timezone on first render and after live swaps',async()=>{
 const w=new Window();try{
  const iso='2030-03-10T12:34:00.000Z';
  const markup=`<a class="quota-ring"><span class="quota-tip"><time datetime="${iso}" data-quota-reset-detail>UTC fallback</time></span></a>`;
  w.document.body.innerHTML=markup;w.eval(script);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const expected=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(new Date(iso));
  expect(w.document.querySelector('time')!.textContent).toBe(expected);
  w.document.body.innerHTML=markup;w.document.body.dispatchEvent(new w.Event('htmx:afterSwap',{bubbles:true}));
  expect(w.document.querySelector('time')!.textContent).toBe(expected);
  expect(w.document.querySelector('.quota-matrix-reset')).toBeNull();
 }finally{await w.happyDOM.close()}
});
