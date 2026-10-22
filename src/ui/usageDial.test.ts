import {expect,test} from 'bun:test';
import dial from './usageDial';
const ctx:any={fns:{procs:{ui:{escape:({text}:any)=>Bun.escapeHTML(String(text))}},ui:{modelLogo:()=>'<svg></svg>'}}};
const base={provider:'codex',account:'work',label:'Codex',usedPercent:20,resetsAt:null,planType:null,parkedAgents:0,tone:'neutral' as const};
test('compact machine groups keep all rings at the same height without per-ring machine captions',()=>{
 const html=dial(ctx,null,{entries:[{...base,node:'mini',account:'a'},{...base,node:'mini',account:'b'},base,{...base,account:'ssh.box.work',model:'ssh/box:codex/work:'}]});
 expect((html.match(/data-quota-group=/g)||[]).length).toBe(3);
 expect((html.match(/<h3 /g)||[]).length).toBe(3);
 expect((html.match(/inline-flex h-8 w-8/g)||[]).length).toBe(4);
 expect(html).toContain('Hyper · mini');expect(html).toContain('SSH · box');
 expect(html.indexOf('data-quota-group="local"')).toBeLessThan(html.indexOf('data-quota-group="hyper/mini"'));
 expect(html).not.toContain('max-w-8');
});
test('local-only skips redundant headings and remote heading is escaped',()=>{
 expect(dial(ctx,null,{entries:[base]})).not.toContain('<h3');
 const html=dial(ctx,null,{entries:[{...base,node:'<bad>'}]});expect(html).toContain('Hyper · &lt;bad&gt;');expect(html).not.toContain('<bad>');
});
test('dual rings support any provider and use per-window configured thresholds',()=>{
 const now=Date.now();const html=dial(ctx,null,{entries:[{...base,provider:'anthropic',thresholds:{warnAt:40,alertAt:80},windows:{primary:{usedPercent:50,resetsAt:now+10000},secondary:{usedPercent:90,resetsAt:now+10000}}}],now});
 expect(html).toContain('data-quota-window="weekly" class="text-error"');
 expect(html).toContain('data-quota-window="5h" class="text-warning"');
 // The hover card rides in the top layer: the dock's backdrop-filter traps z-index.
 expect(html).toContain('class="quota-tip" popover="auto"');expect(html).not.toContain('Available models');
 const ru=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});expect(html).toContain(`resets ${ru.format(new Date(now+10000))}`);expect(html).not.toContain('resets in ');
 const partial=dial(ctx,null,{entries:[{...base,windows:{primary:{usedPercent:100,resetsAt:now-1},secondary:{usedPercent:20,resetsAt:now+10000}}}],now});
 expect(partial).toContain('quota-tip-name">5h</span><span>no data</span>');expect(partial).toContain('quota-tip-name">Weekly</span><span>20% used</span>');
});
