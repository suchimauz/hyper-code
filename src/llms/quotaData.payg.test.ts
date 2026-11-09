import {expect,test} from 'bun:test';
import quotaData from './quotaData';

test('OpenCode PAYG remains status-only even with a legacy percentage snapshot',async()=>{
 for(const planType of ['Pay as you go','PAYG',null]) {
  const entry={provider:'opencode',account:'default',label:'OpenCode Console',planType,available:true,usedPercent:85,parkedAgents:0,tone:'error',windows:{primary:{usedPercent:85,windowMinutes:300}}};
  const ctx:any={fns:{llms:{usageData:async()=>({entries:[entry],gateway:null})},llm:{listAccounts:async()=>[entry]},settings:{getNumber:async({fallback}:any)=>fallback},procs:{db:{select:async()=>[],run:async()=>({changes:1})}}}};
  const [row]=(await quotaData(ctx,null,{})).accounts;
  expect(row.kind).toBe('status');expect(row.windows).toBeUndefined();expect(row.status).toBe('available');expect(row.tone).toBe('neutral');
 }
});
test('explicit OpenCode Go subscription retains measured quota',async()=>{
 for(const planType of ['Go subscription','OpenCode Go','go']) {
  const entry={provider:'opencode',account:'default',label:'OpenCode Go',planType,usedPercent:85,parkedAgents:0,tone:'error',windows:{primary:{usedPercent:85,windowMinutes:300}}};
  const ctx:any={fns:{llms:{usageData:async()=>({entries:[entry],gateway:null})},llm:{listAccounts:async()=>[entry]},settings:{getNumber:async({fallback}:any)=>fallback},procs:{db:{select:async()=>[],run:async()=>({changes:1})}}}};
  const [row]=(await quotaData(ctx,null,{})).accounts;
  expect(row.kind).toBe('quota');expect(row.windows?.fiveHour?.usedPercent).toBe(85);expect(row.tone).toBe('error');
 }
});
