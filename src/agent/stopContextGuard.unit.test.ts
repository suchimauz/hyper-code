import {test,expect} from 'bun:test';
import stop from './stopContextGuard';
function fixture({lost=false,replaced=false,queued=false}={}) {
 const ac=new AbortController(),newAc=new AbortController();
 const agent:any={id:'r',currentJobId:'token',abortController:ac,samplingAbortController:null,scratchpad:{stale:true},isStreaming:true};
 const row:any={scratchpad:JSON.stringify({plan:{tasks:[{status:'active',activeSince:Date.now()-100,elapsedMs:10}]}}),run_token:'token',run_state:'running',next_run_at:queued?123:null};
 let records:any[]=[];let writes=0;let committed=false;
 const ctx:any={fns:{procs:{db:{transaction:async({fn}:any)=>{const out=await fn();committed=true;if(replaced){agent.currentJobId='new';agent.abortController=newAc;}return out;},select:async({sql,params}:any)=>{
 if(sql.startsWith('SELECT scratchpad')){expect(sql).toContain('FOR UPDATE');return lost?[]:[{scratchpad:row.scratchpad}];}
 expect(sql).not.toContain('next_run_at=');writes++;row.scratchpad=params[0];row.updated_at=params[1];row.run_token=null;row.run_state='idle';return [{id:'r'}];
 }}},webPush:{recordFailure:async(o:any)=>{expect(committed).toBe(true);expect(o.finalizedAt).toBe(row.updated_at);records.push(o);}},events:{refreshAgentMeta:()=>{}}}};
 return {ctx,agent,row,ac,newAc,records,writes:()=>writes};
}
test('context guard atomically pauses durable plan and fences owned terminal stamp',async()=>{
 const f=fixture();expect(await stop(f.ctx,null,{agent:f.agent,runToken:'token'})).toBe(true);
 const plan=JSON.parse(f.row.scratchpad).plan;expect(plan.pausedAt).toBe(f.row.updated_at);expect(plan.tasks[0].activeSince).toBeNull();expect(plan.tasks[0].elapsedMs).toBeGreaterThanOrEqual(110);expect(f.ac.signal.aborted).toBe(true);expect(f.records).toHaveLength(1);
});
test('lost ownership cannot stop or notify',async()=>{
 const f=fixture({lost:true});expect(await stop(f.ctx,null,{agent:f.agent,runToken:'token'})).toBe(false);expect(f.writes()).toBe(0);expect(f.ac.signal.aborted).toBe(false);expect(f.records).toHaveLength(0);
});
test('replacement controllers and queued user work remain untouched',async()=>{
 const f=fixture({replaced:true,queued:true});await stop(f.ctx,null,{agent:f.agent,runToken:'token'});
 expect(f.newAc.signal.aborted).toBe(false);expect(f.agent.abortController).toBe(f.newAc);expect(f.agent.currentJobId).toBe('new');expect(f.agent.scratchpad).toEqual({stale:true});expect(f.row.next_run_at).toBe(123);
});
test('already aborted run cannot claim a guard failure',async()=>{
 const f=fixture();f.ac.abort();expect(await stop(f.ctx,null,{agent:f.agent,runToken:'token'})).toBe(false);expect(f.writes()).toBe(0);expect(f.records).toHaveLength(0);
});
