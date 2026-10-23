import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import section from './agentMetaSection';
import inspector from './inspectorSection';
import toggle from './toggle';
import task from './planTaskRow';
import button from '../procs/ui/button';
import layout from './layout';
import knowledge from '../../plugins/knowledge/src/knowledge/agentMetaSection';
const ctx: any = { fns: { procs: { ui: { escape: ({text}: any) => String(text ?? '').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'), attr: () => '', button: (o: any) => button(ctx,null,o) } }, ui: { inspectorSection: (o: any) => inspector(ctx,null,o), toggle: (o: any) => toggle(ctx,null,o), planTaskRow: (o: any) => task(ctx,null,o) } } };
function render(name: any, data: any = {}) { return section(ctx,null,{agent:{id:'ab',scratchpad:{},...data.agent},...data,section:name}); }
function dom(html: string) { const w = new Window(); w.document.body.innerHTML = `<div data-agent-meta-content>${html}</div>`; return w; }
test('all seven sections remain discoverable with empty data', () => {
 for (const name of ['settings','compaction','automation','goal','knowledge','team','plan']) {
  const w=dom(render(name)); expect(w.document.querySelector('details > summary')?.textContent?.trim().length).toBeGreaterThan(0); w.happyDOM.abort();
 }
 expect(render('team')).toContain('No team yet'); expect(render('plan')).toContain('No plan yet'); expect(render('knowledge')).toContain('unavailable');
});
test('settings group preserves independent retrieval flags and informed sharing copy', () => {
 const w=dom(render('settings')); const d=w.document;
 expect(d.querySelectorAll('fieldset').length).toBe(1);
 expect(d.querySelectorAll('details details').length).toBe(1);
 expect(d.querySelectorAll('label .text-micro').length).toBe(0);
 expect(d.querySelectorAll('input[type=checkbox]').length).toBe(3);
 expect(d.querySelectorAll('input[type=hidden]').length).toBe(0);
 expect(d.body.textContent).toContain('external provider');
 for(const input of d.querySelectorAll('input[type=checkbox]')) expect(input.closest('label')?.textContent?.trim()).toBeTruthy();
 w.happyDOM.abort();
});
test('automation creation fields have visible labels, unchanged endpoints, run identity and audit action', () => {
 const w=dom(render('automation',{triggers:[{id:'trigger-1',kind:'cron',status:'active',config:{expression:'0 9 * * *'},prompt:'Review',attempts:2,lastRunError:'Permission denied'}]})); const d=w.document;
 for(const input of d.querySelectorAll('[popover] input:not([type=hidden]), [popover] select')) expect(input.closest('label')?.querySelector('span')?.textContent).toBeTruthy();
 expect(d.querySelector('input[name=triggerId]')?.getAttribute('value')).toBe('trigger-1'); expect(d.body.textContent).toContain('Permission denied'); expect(d.body.textContent).toContain('Audit'); expect(d.querySelector('[hx-confirm="Cancel all triggers?"]')).not.toBeNull();
 w.happyDOM.abort();
});
test('plan editors expose criteria, task identity, visible save and confirmed destructive actions', () => {
 const w=dom(render('plan',{agent:{id:'ab',scratchpad:{plan:{title:'Ship safely',tasks:[{id:'one',title:'Review',instructions:'Tests pass',status:'pending'}]}}}})); const d=w.document;
 expect(d.querySelector('textarea')?.closest('label')?.textContent).toContain('completion criteria'); expect(d.body.textContent).toContain('Save plan'); expect(d.body.textContent).toContain('Add task'); expect(d.querySelector('[hx-confirm="Delete this plan permanently?"]')).not.toBeNull(); expect(d.querySelector('[name=task_id]')?.getAttribute('value')).toBe('one'); w.happyDOM.abort();
});
test('goals stay display-only; team populated progress and secondary actions remain', () => {
 const goals=render('goal',{agent:{id:'ab',scratchpad:{goalTrackingEnabled:true,goalSidecar:{status:'error',error:'Unavailable',goals:[{id:'g',statement:'Finish',status:'active'}]}}}}); expect(goals).toContain('display-only sidecar'); expect(goals).toContain('Unavailable');
 const team=render('team',{team:[{id:'child',title:'Research',status:'working',runState:'running',plan:{tasks:[{id:'t',title:'Check',status:'done'}]},summary:'Done'}]}); expect(team).toContain('1/1 done'); expect(team).toContain('Research');
});
test('knowledge full evidence is available via disclosure on touch, empty/error states remain', () => {
 const evidence='Evidence '.repeat(60)+'END'; const w=dom(knowledge(ctx,null,{agent:{id:'ab',scratchpad:{knowledgeTrackingEnabled:true,knowledgeSidecar:{status:'error',error:'Offline',mentions:[{name:'Example',evidence,status:'ambiguous',sourceMessageIdx:1}]}}} as any}));
 expect(w.document.querySelector('blockquote')?.textContent).toBe(evidence); expect(w.document.body.textContent).toContain('Offline'); expect(w.document.querySelector('a[href="/agent/ab/message/1"]')).not.toBeNull(); w.happyDOM.abort();
 expect(knowledge(ctx,null,{agent:{id:'ab',scratchpad:{}} as any})).toContain('No entities observed yet');
});
test('inspector layout has local touch, typography, focus and reduced motion protections', async () => {
 const css=await Bun.file(new URL('./layout.ts',import.meta.url)).text(); expect(css).toContain(':where([data-agent-meta-content], .inspector-trigger-popup)'); expect(css).toContain('min-height: 44px'); expect(css).toContain('font-size: 16px !important'); expect(css).toContain('.ui-toggle-input:focus-visible + .ui-toggle-track'); expect(css).toContain('prefers-reduced-motion: reduce');
});

test('real renderer action classes and collapsed task instructions are visible controls', () => {
 const w=dom(render('plan',{agent:{id:'ab',scratchpad:{plan:{title:'Ship',tasks:[{id:'one',title:'Review',instructions:'Verify',status:'pending'}]}}}}));
 for(const b of w.document.querySelectorAll('button')) {
   expect(b.classList.contains('ui-button')).toBe(true);
   expect(b.classList.contains('ui-button--ghost')).toBe(false);
 }
 expect(w.document.querySelector('textarea')?.closest('details')?.hasAttribute('open')).toBe(false);
 w.happyDOM.abort();
});

test('shared surface roles cover settings, compaction, lists and native disclosures', () => {
 const samples = [render('settings'), render('compaction'), render('goal'), render('automation', {triggers:[{id:'t',status:'active',kind:'at',config:{},prompt:'Review'}]}), render('team',{team:[{id:'c',title:'Review',status:'working',plan:{tasks:[]}}]}), render('plan',{agent:{id:'ab',scratchpad:{plan:{tasks:[{id:'t',title:'Check',status:'pending'}]}}}}), knowledge(ctx,null,{agent:{id:'ab',scratchpad:{knowledgeSidecar:{mentions:[{name:'Entity',status:'new',evidence:'Source'}]}}} as any})];
 for(const html of samples) { const w=dom(html); expect(w.document.querySelector('.inspector-surface-group, .inspector-surface-row')).not.toBeNull(); for(const input of w.document.querySelectorAll('.ui-toggle-input')) expect(input.closest('.inspector-setting-row')).not.toBeNull(); w.happyDOM.abort(); }
});
async function page(main: string) {
 return layout({...ctx, state:{procs:{styles:[{href:'/compiled-app.css'}]}}, fns:{...ctx.fns, ui:{...ctx.fns.ui,faviconUrl:async()=>'/favicon.ico',navMenu:()=>''},dock:{render:async()=>''}}},null,{main});
}
test('rendered shell does not predeclare layers before the compiled stylesheet or override button contracts', async () => {
 const html=await page(render('settings'));
 const w=new Window(); w.document.write(html);
 const link=w.document.querySelector('link[href="/compiled-app.css"]'); expect(link).not.toBeNull();
 const before=html.slice(0,html.indexOf('<link rel="stylesheet" href="/compiled-app.css"'));
 expect(before).not.toMatch(/@layer\s/);
 // No local tone, size or disabled-state rules: the shared component owns these.
 const css=Array.from(w.document.querySelectorAll('style')).map(s=>s.textContent).join('\n');
 expect(css.slice(css.indexOf('/* Agent Inspector:'),css.indexOf('@media (pointer: coarse)',css.indexOf('/* Agent Inspector:')))).not.toMatch(/\.ui-button/);
 for (const tone of ['default','primary','danger','ghost'] as const) {
  const control=button(ctx,null,{label:'Action',action:'test',tone,size:'xs',disabled:true});
  const d=dom(control); const el=d.document.querySelector('button')!;
  expect(el.classList.contains(`ui-button--${tone}`)).toBe(true);
  expect(el.classList.contains('ui-button--xs')).toBe(true);
  expect(el.disabled).toBe(true); expect(el.getAttribute('style')).toBeNull(); d.happyDOM.abort();
 }
 w.happyDOM.abort();
});
test('rendered Inspector typography and group insets follow semantic roles, not blanket overrides', async () => {
 const html=await page('');
 const start=html.indexOf('/* Agent Inspector:');
 const css=html.slice(start,html.indexOf('@media (pointer: coarse)',start));
 const w=dom(render('settings')+render('compaction')+render('plan',{agent:{id:'ab',scratchpad:{plan:{tasks:[{id:'active',title:'Active',status:'active'},{id:'pending',title:'Pending',status:'pending'}]}}}}));
 // These utility baselines deliberately precede Inspector CSS. Tests exercise actual selectors on renderer output.
 const style=w.document.createElement('style'); style.textContent='.font-semibold{font-weight:600}.font-medium{font-weight:500}'+css; w.document.head.append(style);
 const computed=(selector:string)=>{const el=w.document.querySelector(selector);expect(el).not.toBeNull();return w.getComputedStyle(el!);};
 expect(computed('.inspector-heading').fontWeight).toBe('500');
 expect(computed('legend').fontWeight).toBe('500');
 expect(computed('.inspector-toggle-label').fontWeight).toBe('400');
 expect(computed('.inspector-field > span').fontWeight).toBe('400');
 expect(computed('[data-task-status="active"] .inspector-task-title').fontWeight).toBe('500');
 expect(computed('[data-task-status="pending"] .inspector-task-title').fontWeight).toBe('400');
 expect(computed('.inspector-surface-group').paddingLeft).toBe('0px');
 expect(computed('legend').paddingLeft).toBe('8px');
 expect(computed('.inspector-setting-row').paddingLeft).toBe('8px');
 const outside=w.document.createElement('div'); outside.innerHTML=toggle(ctx,null,{name:'outside',enabled:true,label:'Outside'}); w.document.body.append(outside);
 expect(w.getComputedStyle(outside.querySelector('.inspector-toggle-label')!).fontWeight).toBe('500');
 w.happyDOM.abort();
});
