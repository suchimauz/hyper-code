import {test,expect} from 'bun:test';
import publish from './delegationPublish';
import settle from './delegationSettle';
function fixture(){
 const r:any={reservation_id:'r',root_agent_id:'root',goal_id:'goal',source_agent_id:'child',delegator_agent_id:'root',delegator_run_id:'rt',task_state:'pending_review',authorized_through_idx:2};
 const child:any={run_state:'idle',run_token:null,next_run_at:null,last_processed_msg_idx:2};
 const message:any={role:'user',author:'agent:root',message_type:'delegation_task'};
 const cap:any={capability_id:'cap'};
 let receipt:any={checkpoint_id:'final',sequence:'4'},enabled=true,active=true;
 const writes:any[]=[];
 const ctx:any={state:{procs:{db:{transactionStorage:{getStore:()=>active?{active:true}:undefined}}}},fns:{goal:{enabled:async()=>enabled,delegationLock:async()=>{},delegationAuthorize:async()=>{}},procs:{db:{select:async({sql}:any)=>{
 if(sql.includes('goal_delegation_reservations'))return [r];
 if(sql.includes('goal_usage_checkpoints'))return receipt?[receipt]:[];
 if(sql.includes('goal_delegations'))return [cap];
 if(sql.includes('FROM agents'))return [child];
 if(sql.includes('FROM messages'))return [message];
 throw Error(sql);
 },run:async(o:any)=>writes.push(o)}}}};
 const p=()=>publish(ctx,null,{reservationId:'r',delegatorRunToken:'rt',authorizedThroughIdx:2});
 const s=(outcome:'retry'|'terminal'='terminal')=>settle(ctx,null,{sourceAgentId:'child',sourceRunToken:'ct',checkpointId:'final',sequence:4,outcome});
 return {r,child,message,cap,writes,p,s,noReceipt:()=>receipt=null,oldReceipt:()=>receipt={checkpoint_id:'newer',sequence:5},disable:()=>enabled=false,noTx:()=>active=false};
}
test('publish binds exact task row; arbitrary human provenance rejected',async()=>{const f=fixture();await f.p();expect(f.writes[0].params).toEqual([2,'r']);f.message.author='human';await expect(f.p()).rejects.toThrow('provenance');});
test('publish rejects consumed, already open, scheduled and wrong type',async()=>{for(const kind of ['consumed','open','scheduled','type']){const f=fixture();if(kind==='consumed')f.r.consumed_at=1;if(kind==='open')f.r.task_state='open';if(kind==='scheduled')f.child.next_run_at=1;if(kind==='type')f.message.message_type='normal';await expect(f.p()).rejects.toThrow();expect(f.writes.length).toBe(0);}});
test('terminal settles only exact final receipt and fully processed unscheduled frontier',async()=>{const f=fixture();f.r.task_state='open';await f.s();expect(f.writes.length).toBe(2);expect(f.writes[1].sql).toContain("task_state='closed'");for(const kind of ['missing','older','queued','cursor']){const g=fixture();g.r.task_state='open';if(kind==='missing')g.noReceipt();if(kind==='older')g.oldReceipt();if(kind==='queued')g.child.next_run_at=1;if(kind==='cursor')g.child.last_processed_msg_idx=1;await expect(g.s()).rejects.toThrow();expect(g.writes.length).toBe(0);}});
test('retry settlement keeps task open and freezes frontier',async()=>{const f=fixture();f.r.task_state='open';await f.s('retry');expect(f.writes[1].sql).toContain('retry_from_run_id');expect(f.writes.every(w=>!w.sql.includes('authorized_through_idx='))).toBe(true);});
test('publish and settle disabled or without transaction perform no writes',async()=>{for(const mode of ['disable','noTx'] as const){const f=fixture();f[mode]();await expect(f.p()).rejects.toThrow();await expect(f.s()).rejects.toThrow();expect(f.writes.length).toBe(0);}});
