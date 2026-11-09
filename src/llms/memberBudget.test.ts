import {expect,test} from 'bun:test';
import quotaData from './quotaData';

async function account(planType:string,memberBudgetText:string) {
 const entry={provider:'opencode',account:'default',label:'OpenCode',usedPercent:null,resetsAt:null,planType,parkedAgents:0,tone:'neutral',memberBudgetText};
 const ctx:any={fns:{llms:{usageData:async()=>({entries:[entry],gateway:null})},llm:{listAccounts:async()=>[entry]},settings:{getNumber:async({fallback}:any)=>fallback},procs:{db:{select:async()=>[],run:async()=>({changes:1})}}}};
 return (await quotaData(ctx,null,{})).accounts[0];
}
test('OpenCode PAYG money never becomes a subscription percentage',async()=>{
 const row=await account('Pay as you go','Monthly member budget $1.25 / $10.00');
 expect(Object.values(row.windows ?? {})).toEqual([]);expect(JSON.stringify(row)).not.toContain('$');
});
test('Go unknown quota never exposes cached PAYG dollars as measured quota',async()=>{
 const row=await account('Go subscription','Monthly member budget $5 / unlimited');
 expect(row.kind).toBe('quota');expect(row.windows).toEqual({});expect(row.quotaStatus).toBe('unavailable');
 for(const forbidden of ['unlimited','$5','Monthly member budget']) expect(JSON.stringify(row)).not.toContain(forbidden);
});
