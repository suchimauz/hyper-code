import {test,expect} from 'bun:test';
import barrier from './ownerBarrier';
import apply from './externalApply';

function fixture(){
 const state:any={binding:{sourceAgentId:'a',rootAgentId:'a',runToken:'t',goalId:'g',objective:'old'},revision:2,sealed:false,pendingRequests:new Set(),tail:Promise.resolve()};
 const goal:any={goalId:'g',revision:2,objective:'old',status:'active',usage:{input:'7'}};
 const ctx:any={state:{},fns:{goal:{},procs:{db:{}}}};
 ctx.fns.goal.ownerBarrier=(o:any)=>barrier(ctx,null,o);
 ctx.fns.goal.enabled=async()=>true;
 ctx.fns.goal.runStopRegistry=async()=>state;
 ctx.fns.goal.read=async()=>({enabled:true,goal});
 ctx.fns.goal.runCheckpointFlush=async()=>{state.revision=3;return {kind:'committed',revision:3};};
 ctx.fns.goal.persistTx=async(o:any)=>{expect(o.expectedRevision).toBe(3);return {...goal,revision:4,objective:o.command.objective};};
 ctx.fns.procs.db.transaction=async({fn}:any)=>fn();
 ctx.fns.procs.db.select=async({sql}:any)=>sql.includes('FROM agents')?[{run_token:'t',run_state:'running',archived_at:null}]:[{outstanding:false}];
 return {ctx,state,opts:{agentId:'a',expectedGoalId:'g',expectedRevision:2,expectedRunToken:'t',objective:'new'}};
}
test('opaque leases reject stale or fabricated release and never wait',async()=>{
 const {ctx}=fixture();const call=ctx.fns.goal.ownerBarrier;
 const first=await call({agentId:'a',runToken:'t',action:'acquire'});
 expect(await call({agentId:'a',runToken:'t',action:'acquire'})).toBeNull();
 await expect(call({agentId:'a',runToken:'t',action:'release',lease:{...first}})).rejects.toThrow('mismatch');
 await call({agentId:'a',runToken:'t',action:'release',lease:first});
 const next=await call({agentId:'a',runToken:'next',action:'acquire'});
 await expect(call({agentId:'a',runToken:'t',action:'release',lease:first})).rejects.toThrow('mismatch');
 expect(await call({agentId:'a',runToken:'next',action:'acquire'})).toBeNull();
 await call({agentId:'a',runToken:'next',action:'release',lease:next});
});
test('mutation waits for an occupied accounting boundary like the Codex goal state permit, then applies',async()=>{
 const {ctx,opts,state}=fixture();
 const held=await ctx.fns.goal.ownerBarrier({agentId:'a',runToken:'t',action:'acquire'});
 let done=false;const pending=apply(ctx,null,opts).then(r=>{done=true;return r;});
 await new Promise(r=>setTimeout(r,5));expect(done).toBe(false);expect(state.revision).toBe(2);
 await ctx.fns.goal.ownerBarrier({agentId:'a',runToken:'t',action:'release',lease:held});
 const result=await pending;expect(result.goal?.objective).toBe('new');expect(state.sealed).toBe(true);
 expect(await ctx.fns.goal.ownerBarrier({agentId:'a',runToken:'t',action:'acquire'})).not.toBeNull();
});
test('waiters are served in FIFO order and nonwaiting acquire still returns null',async()=>{
 const {ctx}=fixture();const call=ctx.fns.goal.ownerBarrier;const order:string[]=[];
 const first=await call({agentId:'a',runToken:null,action:'acquire'});
 const w1=call({agentId:'a',runToken:null,action:'acquire',wait:true}).then((l:any)=>{order.push('w1');return l;});
 const w2=call({agentId:'a',runToken:null,action:'acquire',wait:true}).then((l:any)=>{order.push('w2');return l;});
 expect(await call({agentId:'a',runToken:null,action:'acquire'})).toBeNull();
 await call({agentId:'a',runToken:null,action:'release',lease:first});const l1=await w1;expect(order).toEqual(['w1']);
 await call({agentId:'a',runToken:null,action:'release',lease:l1});const l2=await w2;expect(order).toEqual(['w1','w2']);
 await call({agentId:'a',runToken:null,action:'release',lease:l2});
});
test('running edit with a provider request in flight applies at current revision without flushing',async()=>{
 const {ctx,opts,state}=fixture();let flushed=0;state.pendingRequests.add('r1');
 ctx.fns.goal.runCheckpointFlush=async()=>{flushed++;return {kind:'committed',revision:3};};
 ctx.fns.goal.persistTx=async(o:any)=>{expect(o.expectedRevision).toBe(2);return {...fixture().state,revision:3,objective:o.command.objective};};
 await apply(ctx,null,opts);expect(flushed).toBe(0);expect(state.sealed).toBe(true);
});
test('mutation holds barrier across asynchronous accounting and seals only after commit',async()=>{
 const {ctx,opts,state}=fixture();let release!:()=>void;let entered!:()=>void;
 const arrived=new Promise<void>(r=>entered=r);const wait=new Promise<void>(r=>release=r);
 ctx.fns.goal.runCheckpointFlush=async()=>{entered();await wait;return {kind:'committed',revision:3};};
 const pending=apply(ctx,null,opts);await arrived;
 expect(state.sealed).toBe(false);
 expect(await ctx.fns.goal.ownerBarrier({agentId:'a',runToken:'t',action:'acquire'})).toBeNull();
 release();const result=await pending;expect(state.sealed).toBe(true);expect(state.binding.objective).toBe('old');expect(result.goal?.objective).toBe('new');expect(result.goal?.usage).toEqual({input:'7'});
 expect(await ctx.fns.goal.ownerBarrier({agentId:'a',runToken:'t',action:'acquire'})).not.toBeNull();
});
test('failed CAS releases reservation without sealing old binding',async()=>{
 const {ctx,opts,state}=fixture();ctx.fns.goal.persistTx=async()=>{throw new Error('CAS conflict');};
 await expect(apply(ctx,null,opts)).rejects.toThrow('CAS conflict');expect(state.sealed).toBe(false);
 expect(await ctx.fns.goal.ownerBarrier({agentId:'a',runToken:'t',action:'acquire'})).not.toBeNull();
});
test('Stop during checkpoint prevents mutation under locked owner check',async()=>{
 const {ctx,opts,state}=fixture();let writes=0;
 ctx.fns.goal.runCheckpointFlush=async()=>{await Promise.resolve();state.sealed=true;return {kind:'committed',revision:3};};
 ctx.fns.goal.persistTx=async()=>{writes++;};
 await expect(apply(ctx,null,opts)).rejects.toThrow('boundary sealed');expect(writes).toBe(0);
});
