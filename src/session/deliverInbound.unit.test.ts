import {test,expect} from 'bun:test';
import deliver from './deliverInbound';
function fixture(){
 const state:any={draft:1,receipts:[],messages:[],events:[],wake:null,stopped:false,paused:false,fail:false};
 let chain=Promise.resolve();
 const ctx:any={state:{},fns:{session:{scrubUnicode:({text}:any)=>text},agent:{wakeWaiters:()=>{},wakeWorker:()=>{}},procs:{events:{refresh:()=>{}},log:{warn:()=>{}},db:{
 transaction:({fn}:any)=>{const call=chain.then(async()=>{const before=structuredClone(state);try{return await fn();}catch(e){Object.assign(state,before);throw e;}});chain=call.catch(()=>{});return call;},
 select:async({sql,params:p}:any)=>{
 if(sql.includes('FOR UPDATE'))return [{sleep_context:{draftRevision:state.draft}}];
 if(sql.includes('delivery_key=?'))return state.receipts.filter((r:any)=>r.key===p[1]);
 if(sql.includes('ORDER BY seq'))return state.receipts.filter((r:any)=>r.delivered_at==null);
 throw new Error(sql);},
 run:async({sql,params:p}:any)=>{
 if(sql.startsWith('INSERT INTO session_inbound')){state.receipts.push({seq:state.receipts.length,key:p[1],payload:p[2]});return {};}
 if(sql.startsWith('INSERT INTO messages')){const idx=state.messages.length;state.messages.push(p[1]);return {rows:[{idx}]};}
 if(sql.startsWith('INSERT INTO events')){if(state.fail)throw new Error('event failed');const idx=state.events.length;state.events.push(JSON.parse(p[2]));return {rows:[{idx}]};}
 if(sql.startsWith('UPDATE session_inbound')){Object.assign(state.receipts[p[3]],{delivered_at:p[0],message_idx:p[1],event_idx:p[2]});return {};}
 if(sql.startsWith('UPDATE agents')){expect(sql).toContain('stopped by user');expect(sql).toContain('pausedAt');if(p[1]&&!state.stopped&&!state.paused)state.wake??=p[2];return {};}
 throw new Error(sql);}
 }}}};
 const item=(key='a',wake=true)=>({key,text:key,author:'agent:child',messageType:'team_update',event:{type:'team_update'},wake});
 const send=(key='a',wake=true)=>deliver(ctx,null,{id:'root',delivery:item(key,wake)});
 const drain=()=>deliver(ctx,null,{id:'root'});
 return {state,ctx,item,send,drain};
}
test('real inbound helper queues without transcript or wake, drains ordered once',async()=>{const f=fixture();expect((await f.send()).queued).toBe(true);await f.send('b');expect(f.state.messages).toEqual([]);expect(f.state.wake).toBeNull();f.state.draft=null;expect((await f.drain()).drained).toBe(2);expect(f.state.messages).toEqual(['a','b']);expect(f.state.events.map((e:any)=>e.messageIdx)).toEqual([0,1]);expect((await f.send()).duplicate).toBe(true);expect(f.state.messages).toHaveLength(2);});
test('same key with changed immutable payload rejects',async()=>{const f=fixture();await f.send();await expect(deliver(f.ctx,null,{id:'root',delivery:{...f.item(),text:'different'}})).rejects.toThrow('payload mismatch');});
test('atomic rollback on event failure leaves replayable pending delivery',async()=>{const f=fixture();await f.send();f.state.draft=null;f.state.fail=true;await expect(f.drain()).rejects.toThrow('event failed');expect(f.state.messages).toEqual([]);expect(f.state.receipts[0].delivered_at).toBeUndefined();f.state.fail=false;expect((await f.drain()).drained).toBe(1);});
test('stopped, paused and wake false persist without scheduling',async()=>{for(const mode of ['stopped','paused','quiet']){const f=fixture();f.state.draft=null;f.state[mode]=true;await f.send('a',mode!=='quiet');expect(f.state.messages).toEqual(['a']);expect(f.state.wake).toBeNull();}});
test('parallel replays produce one delivery and durable receipt survives transcript clearing',async()=>{const f=fixture();f.state.draft=null;await Promise.all([f.send(),f.send()]);expect(f.state.messages).toHaveLength(1);f.state.messages=[];f.state.events=[];f.state.wake=null;expect((await f.send()).messageIdx).toBe(0);expect(f.state.messages).toEqual([]);expect(f.state.wake).toBeNull();});
