import {expect,test} from 'bun:test';
import quotaData from '../llms/quotaData';

// The retired HTML dial's quota semantics belong to the native JSON boundary.
const base={provider:'claude-code',account:'default',label:'Claude',usedPercent:20,resetsAt:null,planType:null,parkedAgents:0,tone:'neutral'};
async function quotas(entries:any[], gateway:any=null) {
 const ctx:any={fns:{llms:{usageData:async()=>({entries,gateway})},llm:{listAccounts:async()=>entries},settings:{getNumber:async({fallback}:any)=>fallback},procs:{db:{select:async()=>[],run:async()=>({changes:1})}}}};
 return (await quotaData(ctx,null,{})).accounts;
}
const reset=()=>Date.now()+3600000;
test('preserves every local, Hyper and SSH account identity',async()=>{
 const rows=await quotas([base,{...base,node:'mini'},{...base,account:'ssh.box.work'},...Array.from({length:5},(_,i)=>({...base,account:String(i)}))]);
 expect(rows).toHaveLength(8);expect(new Set(rows.map(r=>r.id)).size).toBe(8);
 expect(rows.find(r=>r.connection==='hyper')?.host).toBe('mini');expect(rows.find(r=>r.connection==='ssh')?.host).toBe('box');
 expect(rows[0].connection).toBe('local');
});
test('gateway reports status and never fabricates subscription measurements',async()=>{
 const row=(await quotas([],{status:'available',models:['x']}))[0];
 expect(row.provider).toBe('oneapi');expect(row.kind).toBe('status');expect(row.status).toBe('available');expect(row.windows).toBeUndefined();
});
test('preserves untrusted identity as data, including parked remote accounts',async()=>{
 const row=(await quotas([{...base,node:'<bad>',account:'<account>',parkedAgents:2}]))[0];
 expect(row.host).toBe('<bad>');expect(row.account).toBe('<account>');expect(row.parkedAgents).toBe(2);
});
test('reports simultaneous measured periods, reset timestamps and backend severity',async()=>{
 const resetsAt=reset(); const row=(await quotas([{...base,windows:{primary:{usedPercent:20,windowMinutes:300,resetsAt},secondary:{usedPercent:40,windowMinutes:10080,resetsAt},tertiary:{usedPercent:85,windowMinutes:43200,resetsAt}}}]))[0];
 expect(row.windows).toEqual({fiveHour:{usedPercent:20,resetsAt,tone:'neutral'},weekly:{usedPercent:40,resetsAt,tone:'warning'},monthly:{usedPercent:85,resetsAt,tone:'error'}});expect(row.tone).toBe('error');
});
test('generic, absent and nonstandard measurements never become five-hour quota',async()=>{
 for(const windows of [undefined,{}, {primary:{usedPercent:14,windowMinutes:1440,resetsAt:reset()}}]) {
 const row=(await quotas([{...base,windows}]))[0];expect(row.windows).toEqual({});
 }
 expect(await quotas([])).toEqual([]);
 const row=(await quotas([{...base,usedPercent:null}]))[0];expect(row.quotaStatus).toBe('unavailable');expect(row.windows).toEqual({});
});
test('weekly-only Codex remains weekly and monthly accepts calendar month lengths',async()=>{
 for(const windowMinutes of [40320,43200,44640]) {
 const row=(await quotas([{...base,provider:'codex',windows:{primary:{usedPercent:19,windowMinutes:10080},secondary:{usedPercent:35,windowMinutes}}}]))[0];
 expect(row.windows?.fiveHour).toBeUndefined();expect(row.windows?.weekly?.usedPercent).toBe(19);expect(row.windows?.monthly?.usedPercent).toBe(35);
 }
});
test('Z.ai measured durations survive independently of primary/secondary order',async()=>{
 for(const reverse of [false,true]) {
 const five={usedPercent:20,windowMinutes:300,resetsAt:reset()},week={usedPercent:7,windowMinutes:10080,resetsAt:reset()};
 const row=(await quotas([{...base,provider:'zai-coding',windows:{primary:reverse?week:five,secondary:reverse?five:week}}]))[0];
 expect(row.windows?.fiveHour?.usedPercent).toBe(20);expect(row.windows?.weekly?.usedPercent).toBe(7);
 }
});
test('expired and invalid windows stay unknown rather than fabricated zero',async()=>{
 for(const w of [{usedPercent:100,resetsAt:1},{usedPercent:-1},{usedPercent:101},{usedPercent:null}]) {
 const row=(await quotas([{...base,usedPercent:null,windows:{primary:{...w,windowMinutes:300}}}]))[0];
 expect(row.windows?.fiveHour?.usedPercent).toBeNull();expect(row.quotaStatus).toBe('unavailable');
 }
});
test('stale observations and parked counts survive native conversion',async()=>{
 const row=(await quotas([{...base,quotaStatus:'stale',parkedAgents:14,windows:{primary:{usedPercent:85,windowMinutes:300,resetsAt:reset()}}}]))[0];
 expect(row.quotaStatus).toBe('stale');expect(row.windows?.fiveHour?.usedPercent).toBe(85);expect(row.parkedAgents).toBe(14);
});
