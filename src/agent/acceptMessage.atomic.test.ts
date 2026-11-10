import {test,expect} from 'bun:test';
import accept from './acceptMessage';
function fixture(){
 let waiting=false;const queued:any[]=[];
 let state={messages:[] as any[],events:[] as any[],uploads:[] as any[],scheduled:0,scratchpad:{plan:{pausedAt:100,updatedAt:100,tasks:[{status:'active',activeSince:null as number|null}]}}};let active=false,fail='',saves=0,wakes=0,collision=false;
 const db={transaction:async({fn}:any)=>{const before=structuredClone(state);active=true;try{return await fn();}catch(e){state=before;throw e;}finally{active=false;}},select:async({sql,params}:any)=>sql.includes('FROM agent_turn_queue')?queued.filter(q=>q.requestId===params[1]):sql.includes('FROM agents')?[{id:'a',archived_at:null}]:sql.includes('LEFT JOIN')?state.messages.filter(m=>m.key===params[1]).map(m=>({idx:m.idx,payload:state.events.find(e=>e.messageIdx===m.idx)})):[],run:async({sql,params}:any)=>{if(sql.startsWith('INSERT INTO agent_turn_queue')){queued.push({id:params[0],requestId:params[2],fingerprint:params[3],text:params[4],files:JSON.parse(params[5]),version:1});}if(sql.startsWith('INSERT INTO messages')){const idx=state.messages.length;state.messages.push({idx,key:params[4],content:params[1]});return {rows:[{idx}]};}if(sql.startsWith('INSERT INTO events')){if(collision){collision=false;throw Error('events_pkey duplicate key');}state.events.push(JSON.parse(params[1]));}if(sql.startsWith('UPDATE agents')){if(fail)throw Error(fail);state.scheduled++;}return {rows:[]};}};
 const ctx:any={state:{agent:{a:{id:'a',scratchpad:{}}}},fns:{input:{isWaiting:async()=>{expect(active).toBe(true);return waiting;}},events:{emitAgentsChanged:()=>{}},procs:{db,events:{refresh:()=>{expect(active).toBe(false);}}},auth:{actorId:async()=>null},settings:{getNumber:async()=>0},attachments:{saveUploads:async({files}:any)=>{saves++;return files.map((f:any)=>({ref:{type:'document_ref',attachmentId:'one'},meta:{id:'one',fileName:f.name},pending:{}}));},commitUploads:async()=>{state.uploads.push('one');}},session:{mutateScratchpad:async({mutate}:any)=>{expect(active).toBe(true);await mutate(state.scratchpad,200);return {scratchpad:state.scratchpad};},scrubUnicode:async({text}:any)=>text,syncAgentState:async()=>{expect(active).toBe(false);}},agent:{renderEventHtml:async()=>'<p>user</p>',wakeWaiters:async()=>{expect(active).toBe(false);},wakeWorker:()=>{wakes++;expect(active).toBe(false);}},tools:{runs:()=>[]}}};
 const send=(text='hello',key='same',file=false,htmx=false)=>{const form=new FormData();form.set('text',text);form.set('requestId',key);if(file)form.append('files',new File(['abc'],'a.txt'));return accept(ctx,null,{req:new Request('http://local/agent/a',{method:'POST',body:form,headers:htmx?{'hx-request':'true'}:{}}),params:{id:'a'}});};
 return {send,ctx,queued,wait:(value:boolean)=>waiting=value,state:()=>state,saves:()=>saves,wakes:()=>wakes,fail:(s:string)=>fail=s,collision:()=>collision=true};
}
test('atomic failure before schedule rolls back message event and attachment; retry commits once',async()=>{const f=fixture();f.fail('injected failure');await expect(f.send('hello','same',true)).rejects.toThrow('injected failure');expect(f.state()).toMatchObject({messages:[],events:[],uploads:[],scheduled:0,scratchpad:{plan:{pausedAt:100}}});expect(f.wakes()).toBe(0);f.fail('');expect((await f.send('hello','same',true)).status).toBe(200);expect(f.state().messages.length).toBe(1);expect(f.state().scheduled).toBe(1);});
test('duplicate key returns stored result without uploads or scheduling and mismatched payload is 409',async()=>{const f=fixture();await f.send('hello','same',true);const saves=f.saves();const res=await f.send('hello','same',true);expect(await res.json()).toMatchObject({duplicate:true,messageIdx:0});expect(f.saves()).toBe(saves);expect(f.state().uploads.length).toBe(1);expect(f.state().scheduled).toBe(1);expect((await f.send('different','same',true)).status).toBe(409);});
test('human acceptance resumes plan once; duplicate after another stop leaves pause intact',async()=>{const f=fixture();await f.send();expect(f.state().scratchpad.plan).toMatchObject({pausedAt:null,updatedAt:200,tasks:[{status:'active',activeSince:200}]});f.state().scratchpad.plan.pausedAt=300;f.state().scratchpad.plan.tasks[0]!.activeSince=null;await f.send();expect(f.state().scratchpad.plan.pausedAt).toBe(300);expect(f.state().scratchpad.plan.tasks[0]!.activeSince).toBeNull();});
test('idx collision retries entire transaction with no partial row or notification',async()=>{const f=fixture();f.collision();expect((await f.send()).status).toBe(200);expect(f.state().messages.length).toBe(1);expect(f.state().events.length).toBe(1);expect(f.wakes()).toBe(1);});
test('HTMX acceptance and duplicate retry both acknowledge the same durable index without a body',async()=>{
 const f=fixture();
 for(let attempt=0;attempt<2;attempt++){
  const res=await f.send('hello','same',false,true);
  expect(res.status).toBe(204);
  expect(res.headers.get('x-chat-message-idx')).toBe('0');
  expect(await res.text()).toBe('');
 }
 expect(f.state().messages.length).toBe(1);
 expect(f.state().scheduled).toBe(1);
});
for(const race of [false,true]) test(`archived acceptance rejects ${race?'under row lock':'before reading body'} without uploads or writes`,async()=>{
 let checks=0;
 const ctx:any={state:{agent:{a:{id:'a'}}},fns:{auth:{actorId:async()=>null},settings:{getNumber:async()=>0},procs:{db:{select:async({sql}:any)=>sql.includes('FROM agents')?[{id:'a',archived_at:++checks===1&&race?null:123}]:[],transaction:async({fn}:any)=>fn()}}}};
 const form=new FormData();form.set('text','hello');form.append('files',new File(['file'],'test.txt'));
 const req=new Request('http://localhost/agent/a',{method:'POST',body:form});
 const response=await accept(ctx,null,{req,params:{id:'a'}});
 expect(response.status).toBe(409);expect(await response.json()).toMatchObject({error:'archived'});expect(checks).toBe(race?2:1);expect(req.bodyUsed).toBe(race);
});
test('input gate durably queues exact files without uploads or resume; retries remain queued after gate closes',async()=>{
 const f=fixture();f.wait(true);
 const result=await (await f.send('hello','wait-key',true)).json();
 expect(result).toMatchObject({ok:true,queued:true,version:1});expect(f.queued).toHaveLength(1);
 expect(f.queued[0].files[0]).toMatchObject({name:'a.txt',data:'YWJj'});
 expect(f.saves()).toBe(0);expect(f.wakes()).toBe(0);expect(f.state().scheduled).toBe(0);expect(f.state().messages).toHaveLength(0);expect(f.state().scratchpad.plan.pausedAt).toBe(100);
 f.wait(false);expect(await (await f.send('hello','wait-key',true)).json()).toMatchObject({queued:true,duplicate:true,queueId:result.queueId});expect(f.queued).toHaveLength(1);
 expect((await f.send('changed','wait-key',true)).status).toBe(409);
});
test('input gate rejects explicit and worker promotion before mutation',async()=>{
 for(const runToken of [undefined,'lease']){const f=fixture();f.wait(true);
 const res=await accept(f.ctx,null,{req:new Request('http://local/agent/a',{method:'POST',body:'queued'}),params:{id:'a'},queue:{id:'q',version:1,runToken}});
 expect(res.status).toBe(409);expect(await res.json()).toEqual({error:'input_waiting'});expect(f.state().scheduled).toBe(0);expect(f.state().messages).toHaveLength(0);expect(f.queued).toHaveLength(0);
 }
});
