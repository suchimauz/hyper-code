import {test,expect} from 'bun:test';
import build from './buildLlmRequest';
import select from './selectJevContext';
import repair from '../session/repairToolPairs';
function fixture(){
 const messages:any[]=[{role:'user',id:'u0',content:'Old request'}];
 for(let i=0;i<9;i++)messages.push({role:'assistant',tool_calls:[{id:'t'+i,name:'read'}]},{role:'tool',tool_call_id:'t'+i,content:'old public output '.repeat(100)});
 messages.push({role:'user',id:'u1',content:'Previous request'},{role:'user',id:'u2',content:'Explain a completely unrelated question in detail'});
 const agent:any={id:'test',model:'mock:test',scratchpad:{},messages,jevContextEnabled:true};
 const calls:any[]=[];
 const ctx:any={fns:{agent:{fullSystemPrompt:async()=>'',normalizeSleepContext:()=>null,selectJevContext:(o:any)=>select(ctx,null,o)},session:{repairToolPairs:(o:any)=>repair(ctx,null,o)},llm:{resolveEndpoint:async()=>({provider:'mock'})},auth:{attributeMessages:async(o:any)=>({...o,applied:false})},attachments:{resolveContent:async(o:any)=>o.messages},procs:{log:{warn:()=>{}}},jev:{decide:async(o:any)=>{calls.push(o);return {answers:Object.fromEntries(Object.keys(o.questions).map(k=>[k,{type:'noul',noul:0.01}])),usage:{inputTokens:1,outputTokens:1,cost:null}};}}}};
 return {ctx,agent,calls};
}
test('outgoing builder applies selection without touching transcript or tool pairs',async()=>{
 const {ctx,agent,calls}=fixture();const before=JSON.stringify(agent.messages);
 const out=await build(ctx,null,{agent});expect(calls.length).toBe(1);expect(JSON.stringify(agent.messages)).toBe(before);
 expect(out.messages.filter((m:any)=>String(m.content).includes('Older tool output omitted'))).toHaveLength(3);
 expect(out.messages.filter((m:any)=>m.role==='tool').map((m:any)=>m.tool_call_id)).toEqual(agent.messages.filter((m:any)=>m.role==='tool').map((m:any)=>m.tool_call_id));
});
test('builder tolerates unexpected selection failure',async()=>{
 const {ctx,agent}=fixture();ctx.fns.agent.selectJevContext=async()=>{throw new Error('unexpected failure');};
 const out=await build(ctx,null,{agent});expect(out.messages).toEqual(agent.messages);
});
test('short references and credential-looking requests are never sent to Jev',async()=>{
 for(const content of ['давай','password: abc123 should never be sent','x'.repeat(2001)]){
 const {ctx,agent,calls}=fixture();agent.messages.at(-1).content=content;
 const out=await build(ctx,null,{agent});expect(out.messages).toEqual(agent.messages);expect(calls.length).toBe(0);
 }
});
