import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import task from './planTaskRow';
import section from './agentMetaSection';
import inspector from './inspectorSection';
import toggle from './toggle';
import button from '../procs/ui/button';
const escape = ({text}: any) => String(text ?? '').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const ctx: any = { fns: { procs: { ui: { escape, attr: () => '', button: (o: any) => button(ctx,null,o) } }, ui: { inspectorSection: (o: any) => inspector(ctx,null,o), toggle: (o: any) => toggle(ctx,null,o), planTaskRow: (o: any) => task(ctx,null,o) } } };
const script = await Bun.file(new URL('./$script_meta.js',import.meta.url)).text();
const tasks = [{id:'a',title:'First task',instructions:'Criteria A',status:'active'}, {id:'b',title:'Second task',instructions:'Criteria B',status:'pending'}, {id:'c',title:'Third task',instructions:'Criteria C',status:'pending'}];
function fixture() {
 const w = new Window();
 w.document.body.innerHTML = `<div data-agent-meta-content>${section(ctx,null,{agent:{id:'ab',scratchpad:{plan:{title:'Readable plan',tasks}}} as any,section:'plan'})}</div>`;
 (w as any).htmx = {ajax: () => Promise.resolve()}; (w as any).hyperLive = {subscribe: () => {}}; w.eval(script); return w;
}
test('closed task disclosures show title and status, preserve all submitted inputs and stable identity', () => {
 const w=fixture(), d=w.document, form=d.querySelector('[data-plan-editor]')!;
 const rows=[...d.querySelectorAll('details[data-plan-task]')];
 expect(rows.length).toBe(3); expect(rows.every(r=>!r.hasAttribute('open'))).toBe(true);
 expect(rows[0].querySelector('summary')!.textContent).toContain('First task'); expect(rows[0].querySelector('summary')!.textContent).toContain('In progress');
 expect(rows[0].querySelectorAll('details').length).toBe(0); expect(rows[0].querySelector('input[type=checkbox]')).toBeNull();
 const data=new w.FormData(form as any); expect(data.getAll('task_id')).toEqual(['a','b','c']); expect(data.getAll('task_title')).toEqual(tasks.map(t=>t.title)); expect(data.getAll('task_instructions')).toEqual(tasks.map(t=>t.instructions));
 expect(d.body.textContent).toContain('0 of 3 tasks complete'); w.happyDOM.abort();
});
test('editing updates read-first heading, invalid collapsed fields open, pending reorder retains edited ID association', () => {
 const w=fixture(), d=w.document; const row=d.querySelector('[data-task-id="b"]')!;
 const input:any=row.querySelector('[name=task_title]'); input.value='Edited B'; input.dispatchEvent(new w.Event('input',{bubbles:true})); expect(row.querySelector('summary')!.textContent).toContain('Edited B');
 const outer=row.parentElement!.closest('details')!; outer.removeAttribute('open');
 input.value=''; input.dispatchEvent(new w.Event('invalid')); expect(row.hasAttribute('open')).toBe(true); expect(outer.hasAttribute('open')).toBe(true); input.value='Edited B';
 row.querySelector('[data-plan-task-title]')!.textContent='Server title'; row.dispatchEvent(new w.Event('htmx:after:process',{bubbles:true})); expect(row.querySelector('summary')!.textContent).toContain('Edited B');
 (row.querySelector('[data-plan-move="down"]') as any).click();
 const data=new w.FormData(d.querySelector('[data-plan-editor]') as any); expect(data.getAll('task_id')).toEqual(['a','c','b']); expect(data.getAll('task_title')).toEqual(['First task','Third task','Edited B']);
 (row.querySelector('[data-plan-remove]') as any).click(); expect(d.querySelector('[data-task-id="b"]')).toBeNull(); w.happyDOM.abort();
});
test('new task is expanded and autofocus; goals are distinct observation rows with verification disclosure', () => {
 const w=new Window(); w.document.body.innerHTML=task(ctx,null,{task:{id:'new',status:'pending'},autofocus:true}); expect(w.document.querySelector('details[open] input[autofocus]')).not.toBeNull();
 w.document.body.innerHTML=section(ctx,null,{agent:{id:'ab',scratchpad:{goalTrackingEnabled:true,goalSidecar:{goals:[{id:'g1',statement:'Observable outcome',status:'active',verification:'Inspect result'},{id:'g2',statement:'Another outcome',status:'candidate'}]}}} as any,section:'goal'});
 expect(w.document.querySelectorAll('.inspector-goal-list > .inspector-goal-row').length).toBe(2); expect(w.document.querySelector('.inspector-goal-statement')!.textContent).toBe('Observable outcome'); expect(w.document.querySelector('.inspector-goal-row details')!.textContent).toContain('Inspect result'); expect(w.document.body.textContent).toContain('not execution tasks'); w.happyDOM.abort();
});
test('scoped grouped surfaces preserve desktop rhythm and touch/input safeguards', async () => {
 const css=await Bun.file(new URL('./layout.ts',import.meta.url)).text(); expect(css).toContain('.inspector-task-list, .inspector-goal-list'); expect(css).toContain('background: var(--theme-base-200)'); expect(css).toContain('min-height: 34px; padding: 6px 8px'); expect(css).toContain('min-height: 44px'); expect(css).toContain('font-size: 16px !important'); expect(css).not.toContain('[data-plan-task] > .flex > .min-w-0');
});
