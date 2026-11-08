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
test('in-flight model or tool cycle returns busy before accounting',async()=>{
 const {ctx,opts,state}=fixture();
 await ctx.fns.goal.ownerBarrier({agentId:'a',runToken:'t',action:'acquire'});
 await expect(apply(ctx,null,opts)).rejects.toThrow('busy');expect(state.revision).toBe(2);
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
