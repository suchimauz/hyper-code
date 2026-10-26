import {test,expect} from 'bun:test';
import {Window} from 'happy-dom';
const source=await Bun.file(new URL('./$script_pages.js',import.meta.url)).text();
test('page search and filters combine, reset, and survive replacement without requests',async()=>{
 const w=new Window({url:'http://local/projects/view?projectId=p&list=1'});const d=w.document;
 const html='<section data-project-page><input data-page-search>'+['all','open','running','unread'].map(f=>'<button data-page-filter="'+f+'" aria-pressed="'+(f==='all')+'"></button>').join('')+'<b data-page-count>2</b><div data-page-row data-search="Title model:a aa" data-open="true" data-running="false" data-unread="true"></div><div data-page-row data-search="Other model:b bb" data-open="false" data-running="true" data-unread="false"></div><div data-page-empty hidden></div><div data-page-no-results hidden></div><button data-page-reset></button><details class="pp-menu" open><summary>Actions</summary></details></section>';
 d.body.innerHTML=html;w.eval(source);w.eval(source);
 const search=(value:string)=>{const input=d.querySelector('input')!;input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const count=()=>d.querySelector('[data-page-count]')!.textContent;
 search('MODEL:A');expect(count()).toBe('1');expect(d.querySelector('[data-page-row]')!.hidden).toBe(false);
 d.querySelector<HTMLElement>('[data-page-filter="running"]')!.click();expect(count()).toBe('0');expect(d.querySelector('[data-page-no-results]')!.hidden).toBe(false);
 d.querySelector<HTMLElement>('[data-page-reset]')!.click();expect(count()).toBe('2');expect(d.querySelector('input')!.value).toBe('');
 search(' bb ');expect(count()).toBe('1');
 d.body.innerHTML=html;search('aa');expect(count()).toBe('1');
 d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(d.querySelector('details')!.open).toBe(false);
 await w.happyDOM.close();
});
