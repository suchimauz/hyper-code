import {test,expect} from 'bun:test';
import select from './selectJevContext';
function fixture(){
 const messages:any[]=[{role:'user',content:'Old task',id:'u0'}];
 for(let i=0;i<10;i++)messages.push({role:'assistant',tool_calls:[{id:'t'+i,type:'function',function:{name:'read',arguments:'{}'}}]},{role:'tool',tool_call_id:'t'+i,content:('ordinary historical output '+i+' ').repeat(100)});
 messages.push({role:'user',content:'Previous task',id:'u1'},{role:'assistant',content:'Finished'},{role:'user',content:'Explain the unrelated new task in this conversation' ,id:'u2'});
 const calls:any[]=[];
 const ctx:any={fns:{jev:{decide:async(o:any)=>{calls.push(o);return {answers:Object.fromEntries(Object.keys(o.questions).map(k=>[k,{type:'noul',noul:0.01}])),usage:{inputTokens:100,outputTokens:10,cost:null}};}}}};
 const agent:any={id:'test',scratchpad:{},jevContextEnabled:true};
 return {messages,calls,ctx,agent};
}
test('disabled by default makes no request and preserves references',async()=>{
 const {messages,calls,ctx,agent}=fixture();delete agent.jevContextEnabled;
 expect(await select(ctx,null,{agent,messages})).toBe(messages);expect(calls.length).toBe(0);
});
test('only old tool bodies change, recent six and protocol pairs stay intact',async()=>{
 const {messages,calls,ctx,agent}=fixture();const snapshot=JSON.stringify(messages);
 const out=await select(ctx,null,{agent,messages});expect(JSON.stringify(messages)).toBe(snapshot);
 expect(out.length).toBe(messages.length);expect(calls.length).toBe(1);expect(calls[0].retries).toBe(0);expect(calls[0].timeoutMs).toBe(3000);
 expect(out.filter(m=>String(m.content).includes('Older tool output omitted'))).toHaveLength(4);
 for(let i=0;i<messages.length;i++){if(messages[i].role!=='tool'||Number(messages[i].tool_call_id.slice(1))>=4)expect(out[i]).toBe(messages[i]);else expect(out[i]?.tool_call_id).toBe(messages[i].tool_call_id);}
 expect(agent.scratchpad.jevContextMetrics.savedChars).toBeGreaterThan(0);
 expect(agent.scratchpad.jevContextMetrics.usage.inputTokens).toBe(100);
 expect(JSON.stringify(agent.scratchpad.jevContextCache)).not.toContain('ordinary historical');
});
test('one attempt per user turn, changed content invalidates old omissions',async()=>{
 const {messages,calls,ctx,agent}=fixture();await select(ctx,null,{agent,messages});
 messages[2].content+=' modified';const out=await select(ctx,null,{agent,messages});
 expect(calls.length).toBe(1);expect(out[2]?.content).toBe(messages[2].content);
 messages.push({role:'user',content:'Another different request for the next turn',id:'u3'});await select(ctx,null,{agent,messages});expect(calls.length).toBe(2);
});
test('errors, missing scores and out of range values preserve full context without retries',async()=>{
 for(const mode of ['throw','missing','nan','range']){
 const {messages,ctx,agent}=fixture();let count=0;
 ctx.fns.jev.decide=async()=>{count++;if(mode==='throw')throw new Error('timeout');return {answers:mode==='missing'?{}:{c0:{type:'noul',noul:mode==='nan'?NaN:2}},usage:{inputTokens:2,outputTokens:1,cost:null}};};
 expect(await select(ctx,null,{agent,messages})).toBe(messages);expect(await select(ctx,null,{agent,messages})).toBe(messages);expect(count).toBe(1);expect(agent.scratchpad.jevContextMetrics.status).toBe('error');
 }
});
test('errors, credential-looking outputs, excluded messages and structured content never leave the process',async()=>{
 const {messages,calls,ctx,agent}=fixture();messages[2].content='Error: '+messages[2].content;messages[4].content='Authorization: '+messages[4].content;messages[6].excluded_from_llm=true;messages[8].content=[{type:'text',text:'x'.repeat(2000)}];
 expect(await select(ctx,null,{agent,messages})).toBe(messages);expect(calls.length).toBe(0);
});
test('no earlier user turn or no earlier tool pairs means no provider call',async()=>{
 const {calls,ctx,agent}=fixture();const messages=[{role:'user',content:'first'}, {role:'tool',tool_call_id:'orphan',content:'x'.repeat(2000)}];expect(await select(ctx,null,{agent,messages})).toBe(messages);expect(calls.length).toBe(0);
});
test('positive and uncertain relevance preserve original tool outputs',async()=>{
 const {messages,ctx,agent}=fixture();ctx.fns.jev.decide=async(o:any)=>({answers:Object.fromEntries(Object.keys(o.questions).map(k=>[k,{type:'noul',noul:0.5}])),usage:{inputTokens:1,outputTokens:1,cost:null}});
 expect(await select(ctx,null,{agent,messages})).toBe(messages);
});
