import { test, expect } from 'bun:test';
import reserve from './delegationReserve';
import consume from './delegationConsume';
import cancel from './delegationCancel';
import lock from './delegationLock';
import authorize from './delegationAuthorize';
const goalId='00000000-0000-4000-8000-000000000001';
function fixture(){
 let active=false,enabled=true,status='active';
 const agents:any={root:{id:'root',run_state:'running',run_token:'rt'},child:{id:'child',run_state:'idle',run_token:null,next_run_at:null}};
 const reservations=new Map<string,any>(),caps=new Map<string,any>(),calls:string[]=[];
 const ctx:any={state:{procs:{db:{transactionStorage:{getStore:()=>active?{active:true}:undefined}}}},fns:{goal:{},procs:{db:{}}}};
 ctx.fns.goal.enabled=async()=>enabled;
 ctx.fns.goal.read=async({agentId}:any)=>({enabled,goal:agentId==='root'?{goalId,status}:null});
 for(const [name,fn] of Object.entries({delegationLock:lock,delegationAuthorize:authorize,delegationReserve:reserve,delegationConsume:consume,delegationCancel:cancel})) ctx.fns.goal[name]=(opts:any)=>(fn as any)(ctx,null,opts);
 ctx.fns.procs.db.transaction=async({fn}:any)=>{if(active)throw Error('nested');active=true;try{return await fn();}finally{active=false;}};
 ctx.fns.procs.db.select=async({sql,params:p}:any)=>{
  calls.push(sql);
  if(sql.includes('FROM agents')){const a=agents[p[0]];return a?[{...a,required:a.goal_delegation_required?'true':null}]:[];}
  if(sql.includes('FROM goal_delegation_reservations'))return [...reservations.values()].filter(r=>sql.includes('WHERE source_agent_id=')?r.source_agent_id===p[0]:r.reservation_id===p[0]);
  if(sql.includes('FROM messages'))return [{unauthorized:!!agents.child.unauthorized}];
  if(sql.includes('FROM goal_delegations'))return sql.includes('WHERE reservation_id=')?[...caps.values()].filter(c=>c.reservation_id===p[0]&&c.source_run_id===p[1]):caps.has(p[0])?[caps.get(p[0])]:[];
  throw Error(sql);
 };
 ctx.fns.procs.db.run=async({sql,params:p}:any)=>{
  calls.push(sql);
  if(sql.startsWith('INSERT INTO goal_delegation_reservations')) reservations.set(p[0],{reservation_id:p[0],root_agent_id:p[1],goal_id:p[2],source_agent_id:p[3],delegator_agent_id:p[4],delegator_run_id:p[5],parent_capability_id:p[6]});
  else if(sql.startsWith('UPDATE agents'))agents[p[0]].goal_delegation_required=true;
  else if(sql.startsWith('INSERT INTO goal_delegations'))caps.set(p[0],{capability_id:p[0],root_agent_id:p[1],goal_id:p[2],source_agent_id:p[3],source_run_id:p[4],delegator_agent_id:p[5],delegator_run_id:p[6],parent_capability_id:p[7]});
  else if(sql.includes('SET consumed_at='))Object.assign(reservations.get(p[3]),{consumed_at:p[0],source_run_id:p[1],capability_id:p[2]});
  else if(sql.includes('SET cancelled_at='))Object.assign(reservations.get(p[2]),{cancelled_at:p[0]});
  else if(sql.includes('SET reservation_id='))Object.assign(caps.get(p[1]),{reservation_id:p[0]});
  else if(sql.includes('SET retry_from_run_id=NULL'))Object.assign(reservations.get(p[0]),{retry_from_run_id:null});
  else if(sql.includes("SET task_state='cancelled'"))Object.assign(reservations.get(p[0]),{task_state:'cancelled'});
  else if(sql.includes('SET revoked_at=')){for(const c of caps.values())if(c.reservation_id===p[1]||c.capability_id===p[2])c.revoked_at=p[0];}
  else throw Error(sql);
  return {changes:1};
 };
 const reserveOpts={rootAgentId:'root',goalId,delegatorAgentId:'root',delegatorRunToken:'rt',sourceAgentId:'child'};
 const grant=(extra:any={})=>ctx.fns.procs.db.transaction({fn:()=>ctx.fns.goal.delegationReserve({...reserveOpts,...extra})});
 // Simulate successful trusted initial publication; separate publish tests verify provenance.
 const claim=()=>{for(const r of reservations.values()){r.task_state='open';r.authorized_through_idx=0;}agents.child.run_state='running';agents.child.run_token='ct';};
 const take=(sourceRunToken='ct')=>ctx.fns.goal.delegationConsume({sourceAgentId:'child',sourceRunToken});
 return {ctx,agents,reservations,caps,calls,grant,claim,take,reserveOpts,disable:()=>enabled=false,pause:()=>status='paused'};
}
test('reserve requires transaction; locks root before NOWAIT child and exact replay',async()=>{const f=fixture();await expect(f.ctx.fns.goal.delegationReserve(f.reserveOpts)).rejects.toThrow('publication');const a=await f.grant();expect(await f.grant()).toEqual(a);expect(f.agents.child.goal_delegation_required).toBe(true);const locks=f.calls.filter(s=>s.includes('FOR UPDATE'));expect(locks[0]).not.toContain('NOWAIT');expect(locks[1]).toContain('NOWAIT');});
test('queued/running child and missing inherited capability denied',async()=>{const f=fixture();f.agents.child.next_run_at=1;await expect(f.grant()).rejects.toThrow('Idle');f.agents.child.next_run_at=null;await expect(f.grant({parentCapabilityId:'unexpected'})).rejects.toThrow('cannot inherit');});
test('consume after root idle; same token replay; replacement claim blocked',async()=>{const f=fixture();await f.grant();f.claim();f.agents.root.run_state='idle';f.agents.root.run_token=null;const a=await f.take();expect(a.status).toBe('bound');expect(a.authority.sourceRunId).toBe('ct');expect(a.authority.allowContinuation).toBe(false);expect(await f.take()).toEqual(a);f.agents.child.run_token='next';expect((await f.take('next')).status).toBe('blocked');});
test('missing reservation and disabled marker fail closed without goal SQL',async()=>{const f=fixture();await f.grant();f.claim();f.reservations.clear();expect((await f.take()).status).toBe('blocked');f.disable();f.calls.length=0;expect((await f.take()).status).toBe('blocked');expect(f.calls.length).toBe(1);expect(f.calls[0]).toContain('to_jsonb');});
test('ordinary disabled pre-schema and enabled ordinary agent remain inert',async()=>{const f=fixture();expect((await f.take()).status).toBe('absent');f.disable();expect((await f.take()).status).toBe('disabled');expect(f.calls.every(s=>s.includes('FROM agents'))).toBe(true);});
test('wrong worker token throws, stopped root throws, inactive goal blocks',async()=>{const f=fixture();await f.grant();f.claim();await expect(f.take('wrong')).rejects.toThrow('claim');f.agents.root.stopped_at=1;await expect(f.take()).rejects.toThrow('stopped');delete f.agents.root.stopped_at;f.pause();expect((await f.take()).status).toBe('blocked');});
test('cancel pending and consumed are terminal; marker retained',async()=>{for(const consumed of [false,true]){const f=fixture();const r=await f.grant();f.claim();if(consumed)await f.take();await f.ctx.fns.goal.delegationCancel({rootAgentId:'root',goalId,rootRunToken:'rt',reservationId:r.reservationId});expect((await f.take()).status).toBe('blocked');expect(f.agents.child.goal_delegation_required).toBe(true);if(consumed)expect([...f.caps.values()][0].revoked_at).toBeNumber();}});
test('durable parent permits idle delegator but revoked or mismatched ancestry denies',async()=>{for(const mode of ['valid','revoked','mismatch']){const f=fixture();f.agents.parent={id:'parent',run_state:'running',run_token:'pt'};f.caps.set('pc',{capability_id:'pc',root_agent_id:'root',goal_id:goalId,source_agent_id:'parent',source_run_id:'pt',parent_capability_id:null});await f.grant({delegatorAgentId:'parent',delegatorRunToken:'pt',parentCapabilityId:'pc'});f.agents.parent.run_state='idle';f.agents.parent.run_token=null;f.claim();if(mode==='revoked')f.caps.get('pc').revoked_at=1;if(mode==='mismatch')f.caps.get('pc').source_run_id='other';if(mode==='mismatch')await expect(f.take()).rejects.toThrow('mismatch');else expect((await f.take()).status).toBe(mode==='valid'?'bound':'blocked');}});
test('retry B mints a fresh cap while immutable first claim and closed ancestor survive',async()=>{const f=fixture();await f.grant();f.claim();const a=await f.take();const r=[...f.reservations.values()][0],cap=f.caps.get(a.authority.capabilityId);cap.closed_at=1;cap.settled_checkpoint_id='final-A';r.retry_from_run_id='ct';f.agents.child.run_token='B';const b=await f.take('B');expect(b.status).toBe('bound');expect(b.authority.capabilityId).not.toBe(a.authority.capabilityId);expect(r.source_run_id).toBe('ct');expect(r.capability_id).toBe(a.authority.capabilityId);expect(r.retry_from_run_id).toBe(null);expect(cap.closed_at).toBe(1);expect(await f.take('B')).toEqual(b);});
test('unapproved human input preserves retry permit and mints no capability',async()=>{const f=fixture();await f.grant();f.claim();await f.take();const r=[...f.reservations.values()][0],cap=[...f.caps.values()][0];cap.closed_at=1;cap.settled_checkpoint_id='final';r.retry_from_run_id='ct';f.agents.child.run_token='B';f.agents.child.unauthorized=true;expect((await f.take('B')).status).toBe('blocked');expect(r.retry_from_run_id).toBe('ct');expect(f.caps.size).toBe(1);});
test('pending-review backfill and closed grants cannot consume',async()=>{for(const state of ['pending_review','closed']){const f=fixture();await f.grant();f.claim();[...f.reservations.values()][0].task_state=state;expect((await f.take()).status).toBe('blocked');expect(f.caps.size).toBe(0);}});
test('closed leaf rejects new accounting but closed ancestor retains child authority',async()=>{const f=fixture();f.agents.parent={id:'parent',run_state:'running',run_token:'pt'};f.caps.set('pc',{capability_id:'pc',root_agent_id:'root',goal_id:goalId,source_agent_id:'parent',source_run_id:'pt',parent_capability_id:null});await f.grant({delegatorAgentId:'parent',delegatorRunToken:'pt',parentCapabilityId:'pc'});f.caps.get('pc').closed_at=1;f.claim();const a=await f.take();expect(a.status).toBe('bound');f.caps.get(a.authority.capabilityId).closed_at=2;await expect(f.take()).rejects.toThrow('settled');});
