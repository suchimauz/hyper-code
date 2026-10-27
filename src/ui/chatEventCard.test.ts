import {expect,test} from 'bun:test';
import {Window} from 'happy-dom';
import render from './chatEventCard';
const ctx={} as Context;
test('lifecycle card is compact, escaped and keyboard-disclosable; full content and link are outside summary',async()=>{
 const w=new Window();try{
  const preview='\n<unsafe>\n'+'длинный текст '.repeat(200);
  w.document.body.innerHTML=render(ctx,null,{title:'<title>',subtitle:'step <name>',preview,body:'<pre><span>\nfull original</span></pre>',details:'<code>plan.completed</code>',icon:'checks',tone:'success',href:'/agent/peer',ts:1793096938882,attrs:'data-team-update="plan.completed"'});
  const card=w.document.querySelector('details')!,summary=card.querySelector('summary')!;
  expect(card.open).toBe(false);expect(card.classList.contains('service-event--success')).toBe(true);
  expect(summary.querySelector('.service-title')!.textContent).toBe('<title>');expect(summary.querySelector('.service-subtitle')!.textContent).toBe('step <name>');
  expect(summary.querySelector('.service-preview')!.textContent).toBe(preview.slice(0,1000));expect(summary.querySelector('a')).toBeNull();expect(summary.querySelector('button')).toBeNull();expect(card.querySelector('unsafe')).toBeNull();
  expect(card.querySelector('pre')!.textContent).toBe('\nfull original');expect(card.querySelector('.service-event-link')!.getAttribute('href')).toBe('/agent/peer');expect(card.querySelector('time')!.getAttribute('datetime')).toBe(new Date(1793096938882).toISOString());
  expect(card.querySelector('[data-service-collapse]')!.getAttribute('type')).toBe('button');expect(card.getAttribute('data-team-update')).toBe('plan.completed');
 }finally{await w.happyDOM.close();}
});
test('omitted/invalid time and unsafe destination are not rendered',()=>{
 for(const ts of [undefined,NaN,Infinity]){const html=render(ctx,null,{title:'event',ts,href:'javascript:alert(1)'});expect(html).not.toContain('<time');expect(html).not.toContain('href=');}
 expect(render(ctx,null,{title:'event',href:'//external.test/'})).not.toContain('href=');
});
test('semantic icon, trusted badge and details are preserved',()=>{
 const html=render(ctx,null,{title:'Goal <check>',icon:'target',tone:'success',badge:'<b>done</b>',body:'<p>Verified</p>',details:'<pre>proof</pre>'});
 expect(html).toContain('service-event--success');expect(html).toContain('ph-target');expect(html).toContain('Goal &lt;check&gt;');
 expect(html).toContain('<b>done</b>');expect(html).toContain('<p>Verified</p>');expect(html).toContain('<pre>proof</pre>');
});
