import {test,expect} from 'bun:test';
import lock from './delegationLock';
import authorize from './delegationAuthorize';
import register from './delegationRegister';
import revoke from './delegationRevoke';

const goalId='00000000-0000-4000-8000-000000000001';
function fixture(){
 const agents:any={root:{id:'root',run_token:'rt',run_state:'running',stopped_at:null,archived_at:null},child:{id:'child',run_token:'ct',run_state:'running',stopped_at:null,archived_at:null},grand:{id:'grand',run_token:'gt',run_state:'running',stopped_at:null,archived_at:null}};
 const caps=new Map<string,any>(); const calls:string[]=[];
 let enabled=true, active=false, identity=goalId,status='active';
 const ctx:any={state:{procs:{db:{transactionStorage:{getStore:()=>active?{active:true}:undefined}}}},fns:{goal:{},procs:{db:{}}}};
 ctx.fns.goal.enabled=async()=>enabled;
 ctx.fns.goal.read=async()=>({enabled:true,goal:identity?{goalId:identity,status}:null});
 for(const [name,fn] of Object.entries({delegationLock:lock,delegationAuthorize:authorize,delegationRegister:register,delegationRevoke:revoke}))ctx.fns.goal[name]=(opts:any)=>(fn as any)(ctx,null,opts);
 ctx.fns.procs.db.transaction=async({fn}:any)=>{if(active)throw Error('nested');active=true;try{return await fn();}finally{active=false;}};
 ctx.fns.procs.db.select=async({sql,params:p}:any)=>{
  calls.push(sql);
  if(sql.includes('FROM agents'))return agents[p[0]]?[agents[p[0]]]:[];
  if(sql.includes('WHERE capability_id='))return caps.has(p[0])?[caps.get(p[0])]:[];
  if(sql.includes('WHERE root_agent_id='))return [...caps.values()].filter(c=>c.root_agent_id===p[0]&&c.goal_id===p[1]&&c.source_agent_id===p[2]&&c.source_run_id===p[3]);
  throw Error(sql);
 };
 ctx.fns.procs.db.run=async({sql,params:p}:any)=>{
  calls.push(sql);
  if(sql.startsWith('INSERT')) caps.set(p[0],{capability_id:p[0],root_agent_id:p[1],goal_id:p[2],source_agent_id:p[3],source_run_id:p[4],delegator_agent_id:p[5],delegator_run_id:p[6],parent_capability_id:p[7],revoked_at:null});
  else if(sql.startsWith('UPDATE')){const c=caps.get(p[1]);if(c?.root_agent_id===p[2]&&c.goal_id===p[3])c.revoked_at??=p[0];}
  else throw Error(sql);
  return {changes:1};
 };
 const grant=(extra:any={})=>ctx.fns.goal.delegationRegister({rootAgentId:'root',goalId,delegatorAgentId:'root',delegatorRunToken:'rt',sourceAgentId:'child',sourceRunToken:'ct',...extra});
 const auth=(cap:any,extra:any={})=>ctx.fns.procs.db.transaction({fn:()=>ctx.fns.goal.delegationAuthorize({...cap,sourceRunToken:cap.sourceRunId,...extra})});
 return {ctx,agents,caps,calls,grant,auth,setEnabled:(v:boolean)=>enabled=v,setIdentity:(v:string)=>identity=v,setStatus:(v:string)=>status=v};
}
test('disabled rejects all APIs before SQL or transaction',async()=>{
 const f=fixture();f.setEnabled(false); f.ctx.fns.procs.db.transaction=()=>{throw Error('SQL touched');};
 for(const fn of [lock,authorize,register,revoke])await expect((fn as any)(f.ctx,null,{})).rejects.toThrow('disabled');
 expect(f.calls).toHaveLength(0);
});
test('authorization requires framework transaction',async()=>{
 const f=fixture();await expect(f.ctx.fns.goal.delegationAuthorize({sourceRunId:'ct',sourceRunToken:'ct'})).rejects.toThrow('transaction');expect(f.calls).toHaveLength(0);
});
test('register binds immutable claim, locks root first and source NOWAIT, idempotent',async()=>{
 const f=fixture();const c=await f.grant();expect(c.sourceRunId).toBe('ct');expect(Object.isFrozen(c)).toBe(true);expect(c.allowContinuation).toBe(false);
 expect(f.calls[0]).toContain('FOR UPDATE');expect(f.calls.some(x=>x.includes('NOWAIT'))).toBe(true);expect(await f.grant()).toEqual(c);expect(f.caps.size).toBe(1);
});
test('idle root allows bound child accounting but never scheduling',async()=>{
 const f=fixture(),c=await f.grant();f.agents.root.run_state='idle';f.agents.root.run_token=null;
 expect((await f.auth(c)).allowContinuation).toBe(false);expect(f.calls.every(x=>!x.includes('next_run_at'))).toBe(true);
});
test('stale delegator, source and invented runId reject',async()=>{
 const f=fixture();await expect(f.grant({delegatorRunToken:'fake'})).rejects.toThrow('claim');
 await expect(f.grant({sourceRunToken:'fake'})).rejects.toThrow('claim');
 const c=await f.grant();await expect(f.auth(c,{sourceRunId:'invented'})).rejects.toThrow('worker claim');f.agents.child.run_token='new';await expect(f.auth(c)).rejects.toThrow('claim');
});
test('goal replacement and deletion reject existing grants',async()=>{
 const f=fixture(),c=await f.grant();f.setIdentity('00000000-0000-4000-8000-000000000002');await expect(f.auth(c)).rejects.toThrow('identity');f.setIdentity('');await expect(f.auth(c)).rejects.toThrow('identity');
});
test('stopped or archived root rejects without claiming cutoff support',async()=>{
 const f=fixture(),c=await f.grant();f.agents.root.stopped_at=1;await expect(f.auth(c)).rejects.toThrow('stopped');f.agents.root.stopped_at=null;f.agents.root.archived_at=1;await expect(f.auth(c)).rejects.toThrow('unavailable');
});
test('grandchild inherits root scope and survives delegator finish; ancestor revocation denies',async()=>{
 const f=fixture(),c=await f.grant();
 const extra={delegatorAgentId:'child',delegatorRunToken:'ct',sourceAgentId:'grand',sourceRunToken:'gt'};
 await expect(f.grant(extra)).rejects.toThrow('Inherited');
 const g=await f.grant({...extra,parentCapabilityId:c.capabilityId});f.agents.child.run_state='idle';f.agents.child.run_token=null;
 expect((await f.auth(g)).rootAgentId).toBe('root');
 await f.ctx.fns.goal.delegationRevoke({rootAgentId:'root',goalId,rootRunToken:'rt',capabilityId:c.capabilityId});
 await expect(f.auth(g)).rejects.toThrow('revoked');await expect(f.grant()).rejects.toThrow('claim');
});
test('capability possession cannot change source or root scope',async()=>{
 const f=fixture(),c=await f.grant();await expect(f.auth(c,{sourceAgentId:'grand',sourceRunId:'gt',sourceRunToken:'gt'})).rejects.toThrow('mismatch');
 f.caps.get(c.capabilityId).root_agent_id='other';await expect(f.auth(c)).rejects.toThrow('revoked');
});
test('nonactive goal cannot issue new grants; existing grants may account',async()=>{
 const f=fixture(),c=await f.grant();f.setStatus('paused');expect(await f.auth(c)).toEqual(c);await expect(f.grant()).rejects.toThrow('Active');
});
test('NOWAIT failure propagates so caller retries entire transaction',async()=>{
 const f=fixture();const original=f.ctx.fns.procs.db.select;f.ctx.fns.procs.db.select=async(o:any)=>{if(o.sql.includes('NOWAIT'))throw Error('55P03 lock_not_available');return original(o);};
 await expect(f.grant()).rejects.toThrow('55P03');expect(f.caps.size).toBe(0);
});
