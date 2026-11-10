import {test,expect} from 'bun:test';
import complete from './complete';
import submit from './submit';
function fixture(opts:{stopped?:boolean;archived?:boolean;otherGate?:boolean;paused?:boolean;processing?:boolean}={}) {
 const authority={}; let row:any={id:'i',agentId:'a',kind:'protected',title:'Review',state:opts.processing?'processing':'open'};
 let messages:any[]=[]; let fail=false; let scheduled=false; let due=true; let active=false;
 let tail=Promise.resolve();
 const ctx:any={state:{input:{kinds:{protected:{completionAuthority:authority}}},procs:{db:{transactionStorage:{getStore:()=>active?{active:true}:undefined}}}},fns:{input:{get:async()=>({...row})},session:{appendMessage:async({message}:any)=>{if(fail)throw Error('delivery');messages.push(message);}},agent:{wakeWorker:()=>{}},procs:{events:{refresh:()=>{}},db:{
 select:async()=>[{id:'a',agent_id:'a'}],
 transaction:async({fn}:any)=>{let release!:()=>void;const old=tail;tail=new Promise(r=>release=r);await old;const before={...row};const previous=[...messages];active=true;try{return await fn();}catch(e){row=before;messages=previous;throw e;}finally{active=false;release();}},
 run:async({sql,params}:any)=>{if(sql.startsWith('UPDATE inputs')){if(!['open','processing'].includes(row.state)||(params[0]==='expired'&&(row.state!=='open'||!due)))return {rows:[]};row.state=params[0];return {rows:[{id:'i'}]};} if(sql.startsWith('UPDATE agents')){expect(sql).not.toContain('stopped_at=NULL');expect(sql).toContain('NOT EXISTS');scheduled=!opts.stopped&&!opts.archived&&!opts.otherGate&&!opts.paused;return {rows:scheduled?[{id:'a'}]:[]};}throw Error(sql);}
 }}}};
 return {ctx,authority,get row(){return row;},get messages(){return messages;},get scheduled(){return scheduled;},fail:()=>fail=true,notDue:()=>due=false};
}
const answer=(h:ReturnType<typeof fixture>,state:'submitted'|'cancelled'|'expired'='submitted')=>complete(h.ctx,null,{id:'i',state,summary:state,authority:h.authority});
test('protected completion rejects absent and stale reload capability; generic submit never invokes it',async()=>{
 const h=fixture();await expect(complete(h.ctx,null,{id:'i',state:'submitted',summary:'yes'})).rejects.toThrow('authoritative');
 h.ctx.state.input.kinds.protected.completionAuthority={};await expect(answer(h)).rejects.toThrow('authoritative');
 expect((await submit(h.ctx,null,{id:'i',cancel:true})).error).toContain('dedicated');expect(h.messages.length).toBe(0);
});
test('terminal result delivered once across cancellation and expiry race',async()=>{const h=fixture();await Promise.all([answer(h,'cancelled'),answer(h,'expired')]);expect(h.messages.length).toBe(1);expect(h.row.state).toBe('cancelled');});
test('delivery failure rolls terminal row back',async()=>{const h=fixture();h.fail();await expect(answer(h)).rejects.toThrow('delivery');expect(h.row.state).toBe('open');expect(h.messages.length).toBe(0);});
for(const gate of ['stopped','archived','otherGate','paused'] as const)test('completion preserves '+gate,async()=>{const h=fixture({[gate]:true});expect((await answer(h)).scheduled).toBe(false);expect(h.messages.length).toBe(1);});
test('due open expiry wakes; processing external action and future deadline never expire',async()=>{const h=fixture();expect((await answer(h,'expired')).completed).toBe(true);expect(h.scheduled).toBe(true);const processing=fixture({processing:true});expect((await answer(processing,'expired')).completed).toBe(false);const future=fixture();future.notDue();expect((await answer(future,'expired')).completed).toBe(false);});
