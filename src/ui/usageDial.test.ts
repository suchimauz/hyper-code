import {expect,test} from 'bun:test';
import dial from './usageDial';
const ctx:any={fns:{procs:{ui:{escape:({text}:any)=>Bun.escapeHTML(String(text))}},ui:{modelLogo:({model}:any)=>`<svg data-logo="${Bun.escapeHTML(model)}"></svg>`}}};
const base={provider:'claude-code',account:'default',label:'Claude',usedPercent:20,resetsAt:null,planType:null,parkedAgents:0,tone:'neutral' as const};
const now=1700000000000, resetsAt=now+10000;
test('packs different connections into six-column bands without dropping entries',()=>{
 const html=dial(ctx,null,{entries:[base,{...base,node:'mini'},{...base,account:'ssh.box.work',model:'ssh/box:codex/work:'},...Array.from({length:5},(_,i)=>({...base,account:String(i)}))]});
 expect((html.match(/class="quota-matrix-band"/g)||[]).length).toBe(2);
 expect((html.match(/class="quota-ring quota-matrix-card"/g)||[]).length).toBe(8);
 expect(html).toContain('Hyper · mini');expect(html).toContain('SSH · box');
 expect(html.indexOf('data-quota-group="local"')).toBeLessThan(html.indexOf('data-quota-group="hyper/mini"'));
 expect(html).not.toContain('overflow-x');expect(html).not.toContain(' hidden');
});
test('gateway shares the band but never fabricates quota measurements',()=>{
 const html=dial(ctx,null,{entries:[base,{...base,node:'mini'}],gateway:{status:'available',models:['x'],checkedAt:now},now});
 expect((html.match(/class="quota-matrix-band"/g)||[]).length).toBe(1);
 expect(html).toContain('data-gateway="oneapi"');expect(html).toContain('quota not measured');expect(html).toContain('1 in catalogue');expect(html).toContain('ph-plugs-connected');expect(html).toContain('checked ');
 expect(html).toContain('data-quota-group="gateway"');
});
test('escapes connection and account headings',()=>{
 const html=dial(ctx,null,{entries:[{...base,node:'<bad>',account:'<account>'}]});
 expect(html).toContain('Hyper · &lt;bad&gt;');expect(html).not.toContain('<bad>');expect(html).toContain('&lt;account&gt;');
});
test('shows three simultaneous periods with thresholds, accessible reset details and real logos',()=>{
 const html=dial(ctx,null,{entries:[{...base,windows:{primary:{usedPercent:20,resetsAt},secondary:{usedPercent:40,resetsAt},tertiary:{usedPercent:85,resetsAt}}}],now});
 for(const key of ['5h','weekly','monthly']) expect(html).toContain(`data-quota-window="${key}"`);
 expect(html).toContain('class="text-success" aria-label="20% использовано">20');expect(html).toContain('class="text-warning" aria-label="40% использовано">40');expect(html).toContain('class="text-error" aria-label="85% использовано">85');
 expect(html).toContain('class="quota-tip" popover="auto"');expect(html).toContain('data-logo="claude-code:"');
 expect(html).toContain(new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(new Date(resetsAt))+' UTC');
});
test('missing or expired windows stay unknown; Kimi never invents weekly quota',()=>{
 const html=dial(ctx,null,{entries:[{...base,provider:'kimi-coding',windows:{primary:{usedPercent:20,resetsAt:now-1},tertiary:{usedPercent:50,resetsAt}}}],now});
 expect(html).toContain('Monthly</span><span>50% used');expect(html).toContain('Weekly</span><span>no data');expect(html).toContain('5h</span><span>no data');expect((html.match(/Нет данных/g)||[]).length).toBe(2);
});
test('all expired semantic windows do not resurrect aggregate quota as generic',()=>{
 const html=dial(ctx,null,{entries:[{...base,windows:{primary:{usedPercent:20,resetsAt:now-1}}}],now});
 expect(html).not.toContain('quota-matrix-unknown');expect(html).not.toContain('20% used');expect((html.match(/Нет данных/g)||[]).length).toBe(3);
});
test('undefined optional window slots remain missing instead of throwing',()=>{
 const html=dial(ctx,null,{entries:[{...base,windows:{primary:{usedPercent:17,resetsAt},secondary:undefined,tertiary:undefined}}],now});
 expect(html).toContain('5h</span><span>17% used');expect(html).toContain('Weekly</span><span>no data');expect(html).toContain('Monthly</span><span>no data');
});
test('long gateway diagnostics stay accessible without expanding narrow columns',()=>{
 const html=dial(ctx,null,{entries:[],gateway:{status:'available',models:['x'],checkedAt:now},now});
 expect(html).toContain('quota not measured');expect(html).toContain('ph-check-circle');
 const compact=html.match(/<span class="quota-matrix-status"[^>]*>(.*?)<\/span>/)?.[1];
 expect(compact).not.toContain('catalogue');expect(compact).not.toContain('Asoft LLM Gate');
});
test('generic and non-five-hour measurements never become five-hour percentages',()=>{
 const html=dial(ctx,null,{entries:[{...base,usedPercent:14,windows:{primary:{usedPercent:14,windowMinutes:1440,resetsAt}}}],now});
 expect(html).toContain('quota-matrix-unknown');expect(html).toContain('14% used · период неизвестен');expect(html).not.toContain('5h</span><span>14%');
});
test('stale, unavailable, parked, errors and PAYG budget are preserved',()=>{
 const entry={...base,windows:{primary:{usedPercent:85,resetsAt}}};
 expect(dial(ctx,null,{entries:[{...entry,quotaStatus:'stale'}],now})).toContain('85% used (last known)');
 const unavailable=dial(ctx,null,{entries:[{...entry,quotaStatus:'unavailable',parkedAgents:2,tone:'error'}],now});
 expect(unavailable).toContain('quota unavailable — usage unknown');expect(unavailable).not.toContain('85% used');expect(unavailable).toContain('2 agent(s) parked');expect(unavailable).toContain('Ошибка квоты');
 const payg=dial(ctx,null,{entries:[{...entry,provider:'opencode',memberBudgetText:'PAYG $10'}],now});expect(payg).toContain('data-member-budget="opencode"');expect(payg).toContain('PAYG $10');expect(payg).not.toContain('85% used');
 const go=dial(ctx,null,{entries:[{...entry,provider:'opencode',planType:'Go subscription',memberBudgetText:'PAYG $10'}],now});expect(go).toContain('85% used');expect(go).not.toContain('PAYG $10');
});

test('Codex weekly-only primary keeps dashes in five-hour and monthly cells',()=>{
 const html=dial(ctx,null,{entries:[{...base,provider:'codex',windows:{primary:{usedPercent:19,windowMinutes:10080,resetsAt}}}],now});
 expect(html).toContain('Weekly</span><span>19% used');
 for(const key of ['5h','weekly','monthly']) expect(html).toContain(`data-quota-window="${key}"`);
 expect(html).toContain('5h</span><span>no data');expect(html).toContain('Monthly</span><span>no data');
 expect((html.match(/aria-label="Нет данных">—/g)||[]).length).toBe(2);
 expect(html).not.toContain('quota-matrix-reset');expect(html).not.toContain('<span>Сброс</span>');
});
test('Codex unlabelled primary stays unknown and preserves all three placeholder cells',()=>{
 const html=dial(ctx,null,{entries:[{...base,provider:'codex',usedPercent:19,windows:{primary:{usedPercent:19,resetsAt}}}],now});
 expect(html).toContain('19% used · период неизвестен');
 expect(html).not.toContain('5h</span><span>19%');expect(html).not.toContain('Weekly</span><span>19%');
 expect((html.match(/aria-label="Нет данных">—/g)||[]).length).toBe(3);
});
test('explicit upstream Codex durations remain authoritative when both are provided',()=>{
 const html=dial(ctx,null,{entries:[{...base,provider:'codex',windows:{primary:{usedPercent:19,windowMinutes:300,resetsAt},secondary:{usedPercent:40,windowMinutes:10080,resetsAt}}}],now});
 expect(html).toContain('5h</span><span>19% used');expect(html).toContain('Weekly</span><span>40% used');
});
test('reset timestamps appear only in quota tooltip and unknown resets are not invented',()=>{
 const html=dial(ctx,null,{entries:[{...base,windows:{primary:{usedPercent:19,resetsAt},secondary:{usedPercent:40,resetsAt:now-1}}}],now});
 const [visible,tooltip]=html.split('<span class="quota-tip"');
 expect(visible).not.toContain('<time');expect(visible).not.toContain('quota-matrix-reset');expect(visible).not.toContain('quota-matrix-caption');
 expect(tooltip).toContain(`datetime="${new Date(resetsAt).toISOString()}" data-quota-reset-detail`);
 const unavailable=dial(ctx,null,{entries:[{...base,quotaStatus:'unavailable',resetsAt,windows:{primary:{usedPercent:19,resetsAt}}}],now});
 expect(unavailable).not.toContain('<time');
});
