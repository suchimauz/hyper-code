import {test,expect} from 'bun:test';
import read from './read';
import assertIdle from './assertIdle';
import prompt from './prompt';
import enter from './enter';
import inherit from './inherit';
import propose from './propose';
import review from './review';
import dispatch from '../commands/dispatch';
import parse from '../commands/parse';
import list from '../commands/list';
import submit from '../input/submit';

function fixture() {
 let state:any={mode:null,revision:0,proposal:null,messages:[],inputs:{},requests:{},queued:null,runState:'idle',events:[],forks:[]};
 let notifications=0;
 const req=new Request('http://local/agent/a/planning/review',{method:'POST',headers:{'x-csrf-token':'ok'}});
 const session:any={req,user:{id:'owner'}};
 const ctx:any={state:{agent:{a:{id:'a',activeRunCount:0}}},fns:{}};
 const db={
  transaction:async({fn}:any)=>{const before=structuredClone(state);try{return await fn();}catch(e){state=before;throw e;}},
  select:async({sql,params}:any)=>{
   if(sql.includes('FROM agents')) return [{id:'a',run_state:state.runState,archived_at:null,next_run_at:state.queued}];
   if(sql.includes('FROM agent_planning')) return state.mode?[{mode:state.mode,revision:state.revision,proposal:structuredClone(state.proposal)}]:[];
   if(sql.includes('FROM agent_command_requests')) return state.requests[params[1]]?[state.requests[params[1]]]:[];
   if(sql.includes('FROM messages')) return [];
   if(sql.includes('AS blocking FROM inputs')) return state.inputs[params[0]]?[{agent_id:'a',blocking:false}]:[];
   throw Error('Unexpected select: '+sql);
  },
  run:async({sql,params:p}:any)=>{
   if(sql.startsWith('INSERT INTO agent_planning')) {
    if(sql.includes('DO NOTHING')){state.forks.push({id:p[0],mode:'plan',proposal:null});return {changes:1};}
    state.mode=p[1];state.revision++;state.proposal=null;
   } else if(sql.startsWith('UPDATE agent_planning SET proposal')) {state.proposal=JSON.parse(p[0]);state.revision++;}
   else if(sql.startsWith('UPDATE agent_planning SET mode')){state.mode=p[0];state.revision++;state.proposal=JSON.parse(p[1]);}
   else if(sql.startsWith('INSERT INTO agent_command_requests')) state.requests[p[1]]={command_text:p[2],result:JSON.parse(p[3])};
   else if(sql.startsWith('UPDATE agents')) state.queued=p[0];
   else if(sql.startsWith('INSERT INTO inputs')) state.inputs[p[0]]={id:p[0],agentId:p[1],kind:'planning-review',state:'open',spec:JSON.parse(p[2])};
   else if(sql.startsWith("UPDATE inputs SET state='cancelled'")){const input=state.inputs[p[1]];if(input?.state==='open')input.state='cancelled';}
   else if(sql.startsWith("UPDATE inputs SET state='submitted'")){const input=state.inputs[p[3]];if(!input||input.state!=='open')return {changes:0};input.state='submitted';input.result=JSON.parse(p[0]);}
   else throw Error('Unexpected run: '+sql);
   return {changes:1,rows:[]};
  },
 };
 ctx.fns={procs:{db},projects:{principal:async()=> 'user:owner'},auth:{verifyCsrf:async({token}:any)=>token==='ok'},agent:{current:async()=>({id:'a'}),renderEventHtml:async()=>'<p>event</p>'},session:{appendMessage:async({message}:any)=>{state.messages.push(message);return {idx:state.messages.length-1};},appendEvent:async({event}:any)=>state.events.push(event)},planning:{read:(o:any)=>read(ctx,session,o),assertIdle:(o:any)=>assertIdle(ctx,session,o),publish:async()=>{notifications++;}},commands:{recordEvent:async(event:any)=>state.events.push(event),list:()=>list(ctx,session,{}),parse:(o:any)=>parse(ctx,session,o)},input:{get:async({id}:any)=>state.inputs[id]}};
 const command=(text:string,key=text)=>dispatch(ctx,session,{agentId:'a',text,requestId:key});
 const proposal=(plan='Exact plan\n1. Read only\n2. Report')=>propose(ctx,session,{plan});
 const decide=(decision:'approve'|'keep',revision=state.revision,id=state.proposal?.id)=>review(ctx,session,{req,agentId:'a',proposalId:id,decision,expectedRevision:revision});
 return {ctx,session,req,state:()=>state,command,proposal,decide,notifications:()=>notifications};
}

test('successive bare /plan requests toggle durable mode, including whitespace, without scheduling work',async()=>{
 const f=fixture();
 for(const [i,mode] of ['plan','execute','plan','execute'].entries()) {
  const text=i===1?'  /plan \n':'/plan';
  expect(await f.command(text,'toggle-'+i)).toMatchObject({scheduled:false,planning:{mode,revision:i+1}});
  expect(f.state().events.at(-1).text).toContain(mode==='execute'?'disabled':'enabled');
 }
 expect(f.state().messages).toEqual([]);expect(f.state().queued).toBeNull();expect(f.notifications()).toBe(4);
 expect(await f.command('/plan','toggle-0')).toMatchObject({duplicate:true,planning:{mode:'plan',revision:1}});
 expect(f.state().mode).toBe('execute');expect(f.state().revision).toBe(4);expect(f.notifications()).toBe(4);
});
test('explicit off stays execute; on and task arguments retain their parsed scheduling behavior',async()=>{
 const f=fixture();
 await f.command('/plan','enable');
 for(const key of ['off-1','off-2']) expect(await f.command('/plan off',key)).toMatchObject({scheduled:false,planning:{mode:'execute'}});
 for(const arg of ['on','inspect backend']) {
  const g=fixture();await g.command('/plan','enable');
  expect(await g.command('/plan '+arg,'argument')).toMatchObject({scheduled:true,planning:{mode:'plan'}});
  expect(g.state().messages).toMatchObject([{content:arg,message_type:'planning_task'}]);
 }
});
test('default execute is distinct from task tracking; parse discovery rejects unknown commands and allows paths',async()=>{
 const f=fixture();expect((await read(f.ctx,null,{agentId:'a'})).mode).toBe('execute');
 expect(await parse(f.ctx,null,{text:'hello'})).toBeNull();expect(await parse(f.ctx,null,{text:'/tmp/file'})).toBeNull();
 expect(await parse(f.ctx,null,{text:'/plan off'})).toEqual({name:'plan',mode:'execute',task:''});
 await expect(parse(f.ctx,null,{text:'/plna'})).rejects.toThrow('Unknown command');
});
test('bare toggle does not create a turn or queue work and replays idempotently',async()=>{
 const f=fixture();const first=await f.command('/plan','k');expect(first).toMatchObject({scheduled:false,planning:{mode:'plan',revision:1}});
 expect(f.state().messages).toEqual([]);expect(f.state().queued).toBeNull();
 expect(await f.command('/plan','k')).toMatchObject({duplicate:true});expect(f.state().revision).toBe(1);
 await expect(f.command('/plan off','k')).rejects.toThrow('reused');
 await f.command('/plan off');expect(f.state().mode).toBe('execute');expect(f.state().messages).toEqual([]);
});
test('mode and task commit together, duplicate never queues twice; queued and running transitions rejected',async()=>{
 const f=fixture();expect(await f.command('/plan inspect contracts','k')).toMatchObject({scheduled:true,planning:{mode:'plan'}});
 expect(f.state().messages).toHaveLength(1);expect(f.state().messages[0].content).toBe('inspect contracts');
 expect(await f.command('/plan inspect contracts','k')).toMatchObject({duplicate:true});expect(f.state().messages).toHaveLength(1);
 await expect(f.command('/plan off','off')).rejects.toThrow('Stop');expect(f.state().mode).toBe('plan');
 f.state().queued=null;f.state().runState='running';await expect(f.command('/plan off','off')).rejects.toThrow('Stop');
});
test('exact proposal requires plan mode, is idempotent, and generic submit/cancel cannot change it',async()=>{
 const f=fixture();await expect(f.proposal()).rejects.toThrow('Enter /plan');await f.command('/plan');
 const one=await f.proposal();const two=await f.proposal();expect(two.proposal?.id).toBe(one.proposal?.id);expect(two.revision).toBe(one.revision);
 for(const cancel of [false,true]){const r=await submit(f.ctx,null,{id:one.proposal!.inputId,cancel,values:{decision:'approve'}});expect(r.error).toContain('human');}
 expect(f.state().inputs[one.proposal!.inputId].state).toBe('open');expect(f.state().mode).toBe('plan');
});
test('approve binds revision and exact text, atomically queues once, duplicate is harmless',async()=>{
 const f=fixture();await f.command('/plan');const p=await f.proposal('EXACT <text>\nline two');
 await expect(f.decide('approve',p.revision-1)).rejects.toThrow('refresh');expect(f.state().messages).toHaveLength(0);
 expect(await f.decide('approve')).toMatchObject({scheduled:true,planning:{mode:'execute',proposal:{status:'approved'}}});
 expect(f.state().messages[0].content).toContain('EXACT <text>\nline two');expect(f.state().messages).toHaveLength(1);
 expect(await f.decide('approve',p.revision)).toMatchObject({duplicate:true});expect(f.state().messages).toHaveLength(1);
});
test('keep does not queue; superseded or cancelled input cannot approve; CAS failure rolls back mode',async()=>{
 const f=fixture();await f.command('/plan');const first=await f.proposal();await f.decide('keep');
 expect(f.state().mode).toBe('plan');expect(f.state().queued).toBeNull();expect(f.state().messages).toHaveLength(0);
 const second=await f.proposal('revised');await expect(f.decide('approve',first.revision,first.proposal!.id)).rejects.toThrow('no longer current');
 f.state().inputs[second.proposal!.inputId].state='cancelled';await expect(f.decide('approve')).rejects.toThrow('no longer open');expect(f.state().mode).toBe('plan');expect(f.state().proposal.status).toBe('pending');
});
test('review rejects non-request caller and invalid CSRF; fresh prompt and fork preserve mode only',async()=>{
 const f=fixture();await f.command('/plan');const p=await f.proposal();
 await expect(review(f.ctx,null,{req:f.req,agentId:'a',proposalId:p.proposal!.id,decision:'approve',expectedRevision:p.revision})).rejects.toThrow('human HTTP');
 const bad=new Request('http://local',{method:'POST'});f.session.req=bad;
 await expect(review(f.ctx,f.session,{req:bad,agentId:'a',proposalId:p.proposal!.id,decision:'approve',expectedRevision:p.revision})).rejects.toThrow('CSRF');
 expect(await prompt(f.ctx,null,{agentId:'a'})).toContain('PLAN (advisory');
 await inherit(f.ctx,null,{sourceId:'a',targetId:'child'});expect(f.state().forks).toEqual([{id:'child',mode:'plan',proposal:null}]);
 await f.command('/plan off');expect(await prompt(f.ctx,null,{agentId:'a'})).toContain('mode: execute');
});

test('agent can enter planning during a run without scheduling or enabling execution',async()=>{
 const f=fixture();f.state().runState='running';f.state().queued=123;
 f.ctx.state.agent.a.activeRunCount=1;
 expect(await enter(f.ctx,null,{})).toMatchObject({mode:'plan',revision:1});
 expect(f.state().queued).toBe(123);expect(f.state().messages).toEqual([]);
 expect(f.notifications()).toBe(1);
 await f.proposal('Preserve this exact plan');
 const before=structuredClone(f.state().proposal);const revision=f.state().revision;
 expect(await enter(f.ctx,null,{})).toMatchObject({mode:'plan',revision,proposal:before});
 expect(f.state().proposal).toEqual(before);
 await expect(f.command('/plan off')).rejects.toThrow();
 expect(f.state().mode).toBe('plan');
});
test('agent planning entry rejects missing or archived sessions',async()=>{
 for(const rows of [[],[{id:'a',archived_at:1}]]) {
  const f=fixture();f.ctx.fns.procs.db.select=async()=>rows;
  await expect(enter(f.ctx,null,{})).rejects.toThrow('Active session required');
  expect(f.notifications()).toBe(0);expect(f.state().mode).toBeNull();
 }
});
test('fresh prompt explains semantic entry and research-first planning',async()=>{
 const f=fixture();const executing=await prompt(f.ctx,null,{agentId:'a'});
 expect(executing).toContain('planning.enter');expect(executing).toContain('not by keyword');
 await enter(f.ctx,null,{});
 const planning=await prompt(f.ctx,null,{agentId:'a'});
 for(const text of ['Phase 1','Phase 2','Phase 3','planning.propose','Approve','not a sandbox']) expect(planning).toContain(text);
});
