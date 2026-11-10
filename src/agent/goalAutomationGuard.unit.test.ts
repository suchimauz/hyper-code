import { expect, test } from 'bun:test';
import run from './run';
import barrier from '../goal/ownerBarrier';
import classifyError from '../llm/classifyError';

// Entirely mocked run boundary: no live database, providers, tools or migrations.
function fixture(kind = 'bound', checkpoint = 'active', pending: boolean | 'unknown' = false) {
 const messages: any[] = [], executed: string[] = [];
 let streams = 0, checks = 0, flushes = 0, inputReads = 0, idx = 0;
 const state: any = {binding:{rootAgentId:'a',goalId:'g',runToken:'token'},pendingRequests:new Set(),sealed:false};
 const agent: any = {id:'a',scratchpad:{plan:{tasks:[{id:'work',status:'active',title:'Work'}]}},messages:[],events:[],model:'openai:test',goal:{enabled:true,statement:'legacy'}};
 const noop = async()=>{};
 const ctx: any = {state:{},fns:{
 input:{isWaiting:async()=>false},
 planning:{read:async({agentId}:any)=>({version:1,agentId,mode:'execute',revision:0,scope:'session',advisory:true,runningPolicy:'reject',pending:null,proposal:null})},
  session:{forAgent:()=>({}),appendUserMessage:noop,appendMessage:async({message}:any)=>{messages.push(message);return {idx:idx++}},syncAgentState:noop,updateMessageContent:noop,appendAssistantEvent:async()=>({idx:idx++}),appendToolCallEvent:noop,recordContextUsage:noop,appendErrorEvent:noop,appendEvent:noop},
  agent:{retrySchedule:async()=>false,retryWait:noop,recordRunLifecycle:noop,statusLineForTurn:async()=>'',autoCompactIfNeeded:async()=>({status:'not_needed'}),stashResult:async({output}:any)=>({content:output}),sanitizeHtmlBody:({html}:any)=>html,checkGoal:async()=>{checks++;return {status:'achieved',reason:'done'}},recordGoalCheck:noop},
  procs:{db:{run:async()=>({changes:0}),select:async({sql}:any)=>{if(sql.includes('FROM inputs')){inputReads++;if(pending==='unknown')throw Error('unknown input');return [{pending_input:pending}]}return [{i:0,stopped_at:null,run_state:'running'}]}},events:{emit:noop},log:{warn:noop}},
  goal:{ownerBarrier:(o:any)=>barrier(ctx,null,o),delegationScope:async({fn}:any)=>fn(),runBindingCapture:async()=>kind==='bound'?{kind,state}:{kind,allowContinuation:false},forkRelease:noop,runStopRegistry:noop,runUsageRecord:async({requestId}:any)=>{state.pendingRequests.delete(requestId);return {kind:'recorded'}},runCheckpointFlush:async()=>{flushes++;return checkpoint==='unknown'?{kind:'blocked',allowContinuation:false}:{kind:'committed',status:checkpoint,allowContinuation:checkpoint==='active'}},budgetSteer:noop},
  llm:{resolveEndpoint:async()=>({provider:'openai',api:'openai'}),classifyError:(opts:any)=>classifyError(ctx,null,opts),stream:async()=>{streams++;if(streams>4)throw Error('unbounded loop');return {text:'human answer',usage:{}}}},
  markdown:{render:async({source}:any)=>source},tools:{call:async({name}:any)=>{executed.push(name);return {handlerExecuted:true,output:'ok'}}}
 }};
 if(kind==='inactive'){
  agent.currentJobId='token';
  ctx.fns.procs.db.select=async()=>[{i:0,stopped_at:null,run_state:'running',run_token:'token'}];
  ctx.fns.goal.runBindingCapture=async()=>({kind:'inactive',goalId:'g',allowContinuation:false});
  ctx.fns.goal.read=async()=>({enabled:true,goal:{goalId:'g',revision:1,status:'paused'}});
 }
 return {ctx,agent,state,messages,executed,counts:()=>({streams,checks,flushes,inputReads}),execute:(extra:any={})=>run(ctx,null,{agent,userText:'human question',...extra})};
}
for(const kind of ['bound','inactive','excluded']) test(`${kind} cannot use legacy or plan as a Goal bypass`,async()=>{
 const h=fixture(kind);const result=await h.execute();expect(result.text).toBe('human answer');expect(h.counts().streams).toBe(1);expect(h.counts().checks).toBe(0);expect(h.messages.some(m=>m.message_type==='plan_feedback')).toBe(false);
});
for(const pending of [true,'unknown'] as const) test(`absent Goal plan/legacy stops at ${pending} pending-input boundary`,async()=>{
 const h=fixture('absent','active',pending);await h.execute();expect(h.counts().streams).toBe(1);expect(h.counts().checks).toBe(0);
});
for(const kind of ['disabled','absent']) test(`${kind} retains ordinary bounded plan and legacy`,async()=>{
 const h=fixture(kind);await h.execute();expect(h.counts().streams).toBe(3);expect(h.counts().checks).toBe(3);expect(h.messages.filter(m=>m.message_type==='plan_feedback')).toHaveLength(2);if(kind==='disabled')expect(h.counts().inputReads).toBe(0);
});
// Unknown accounting answers with a bounded summary; a committed non-active status stops
// silently because the durable Goal status already explains the stop.
for(const boundary of ['unknown','budget_limited','paused']) test(`${boundary} usage/checkpoint stops without tool or extra inference`,async()=>{
 const h=fixture('bound',boundary);let calls=0;h.ctx.fns.llm.stream=async()=>{calls++;return {toolCalls:[{id:'t',name:'danger',args:{}}],usage:{}}};
 const result=await h.execute();if(boundary==='unknown')expect(result.text).toContain('Further automatic work stopped');else expect(result.text).toBe('');expect(calls).toBe(1);expect(h.executed).toEqual([]);expect(h.counts().checks).toBe(0);
});
test('checkpoint budget transition within batch skips remaining tools and inference',async()=>{
 const h=fixture();let flushes=0,calls=0;h.ctx.fns.goal.runCheckpointFlush=async()=>({kind:'committed',allowContinuation:++flushes===1,status:flushes===1?'active':'budget_limited'});
 h.ctx.fns.llm.stream=async()=>{calls++;return {toolCalls:[{id:'t1',name:'first',args:{}},{id:'t2',name:'second',args:{}}],usage:{}}};
 const result=await h.execute();expect(h.executed).toEqual(['first']);expect(calls).toBe(1);expect(result.text).toBe('');
});
test('confirmed inactive capture permits explicit human tool work, but no synthetic continuation',async()=>{
 const h=fixture('inactive');let calls=0;h.ctx.fns.llm.stream=async()=>++calls===1?{toolCalls:[{id:'t',name:'humanTool',args:{}}]}:{text:'answer'};
 await h.execute();expect(h.executed).toEqual(['humanTool']);expect(calls).toBe(2);expect(h.counts().checks).toBe(0);
});
// Every provider reports usage through the common stream shape; unusable usage
// blocks accounting, so proposed tools are refused and only a bounded summary remains.
test('blocked provider usage refuses proposed tools after one request',async()=>{
 const h=fixture();let calls=0;const formats:string[]=[];
 h.ctx.fns.llm.resolveEndpoint=async()=>({provider:'anthropic',api:'anthropic'});
 h.ctx.fns.goal.runUsageRecord=async({format,requestId}:any)=>{formats.push(format);h.state.pendingRequests.delete(requestId);h.state.blocked='Unknown usage';return {kind:'blocked',allowContinuation:false}};
 h.ctx.fns.goal.runCheckpointFlush=async()=>({kind:'blocked',allowContinuation:false});
 h.ctx.fns.llm.stream=async()=>{calls++;return {toolCalls:[{id:'t',name:'work',args:{}}]}};
 const result=await h.execute();expect(formats).toEqual(['common-stream']);expect(calls).toBe(1);expect(h.executed).toEqual([]);expect(result.text).toContain('Further automatic work stopped');
});
test('blocked capture refuses human and automatic work before sampling',async()=>{
 const h=fixture('blocked');const result=await h.execute();expect(result.goalAdmissionBlocked).toBe(true);expect(h.counts().streams).toBe(0);expect(h.counts().checks).toBe(0);expect(h.executed).toEqual([]);expect(h.messages.some(m=>m.message_type==='plan_feedback')).toBe(false);
});

function nativeFixture(kind = 'bound') {
 const h = fixture(kind); h.agent.currentJobId = 'token'; h.agent.goal = undefined; h.agent.scratchpad.plan = undefined;
 h.state.revision = 1; h.state.binding.sourceAgentId = 'a';
 let snapshot: any = kind === 'bound' ? {goalId:'g',revision:1,status:'active'} : null;
 let invocation: any; let captures = 0;
 h.ctx.fns.procs.db.select = async () => [{i:0,stopped_at:null,run_state:'running',run_token:'token'}];
 h.ctx.fns.goal.read = async () => ({enabled:true,goal:snapshot});
 h.ctx.fns.goal.nativeCapability = async () => ({available:false});
 h.ctx.fns.goal.toolScope = async (o:any) => { invocation=o; return o.fn(); };
 h.ctx.fns.goal.runBindingCapture = async () => {captures++;return snapshot ? {kind:'bound',state:h.state} : {kind:'absent'};};
 h.ctx.fns.goal.runCheckpointFlush = async () => ({kind:'committed',revision:++h.state.revision,status:snapshot?.status ?? 'active',allowContinuation:false});
 return {...h, invocation:()=>invocation, captures:()=>captures, setSnapshot:(s:any)=>{snapshot=s;}};
}
test('native update receives committed CAS revision and captured claim',async()=>{
 const h=nativeFixture();let requests=0;
 h.ctx.fns.llm.stream=async()=>++requests===1?{toolCalls:[{id:'t',name:'update_goal',args:{}}],usage:{}}:{text:'done',usage:{}};
 h.ctx.fns.tools.call=async()=>{const scope=h.invocation();expect(scope.binding.runToken).toBe('token');expect(scope.binding.expectedRevision).toBe(2);expect(scope.binding.maxTokenBudget).toBeNull();await scope.onMutation({goalId:'g',revision:3,status:'complete'});h.setSnapshot({goalId:'g',revision:3,status:'complete'});return {handlerExecuted:true,output:'complete'};};
 // A committed completion permits exactly one final report request.
 await h.execute();expect(requests).toBe(2);
});
test('native create explicitly rebinds and bills only following requests',async()=>{
 const h=nativeFixture('absent');let requests=0;const billed:string[]=[];
 h.ctx.fns.llm.stream=async()=>++requests===1?{toolCalls:[{id:'t',name:'create_goal',args:{}}],usage:{label:'before'}}:{text:'done',usage:{label:'after'}};
 h.ctx.fns.goal.runUsageRecord=async({requestId,usage}:any)=>{billed.push(usage.label);h.state.pendingRequests.delete(requestId);return {kind:'recorded'};};
 h.ctx.fns.tools.call=async()=>{expect(h.invocation().binding.expectedGoalId).toBeNull();h.setSnapshot({goalId:'g',revision:1,status:'active'});await h.invocation().onMutation({goalId:'g',revision:1,status:'active'});return {handlerExecuted:true,output:'created'};};
 await h.execute();expect(h.captures()).toBe(2);expect(requests).toBe(2);expect(billed).toEqual(['after']);
});
test('swallowed post-commit handoff failure forbids tools and subsequent inference',async()=>{
 const h=nativeFixture('absent');let requests=0;let calls=0;
 h.ctx.fns.llm.stream=async()=>{requests++;return {toolCalls:[{id:'t',name:'create_goal',args:{}},{id:'u',name:'work',args:{}}],usage:{}};};
 h.ctx.fns.tools.call=async()=>{calls++;try{await h.invocation().onMutation({goalId:'new',revision:1,status:'active'});}catch{}return {handlerExecuted:true,isError:true,output:'handoff failed'};};
 await h.execute();expect(calls).toBe(1);expect(requests).toBe(1);
});


for (const role of ['descendant','sidecar','unclaimed']) test(`native mutation scope is cleared for ${role}`,async()=>{
 const h=nativeFixture(role==='descendant'?'bound':'absent');
 const authority={rootAgentId:'root',goalId:'g',sourceAgentId:'a',sourceRunId:'token',capabilityId:'cap',allowContinuation:false};
 if(role==='descendant'){h.agent.parentId='root';h.state.binding.rootAgentId='root';h.state.binding.authority=authority;}
 if(role==='sidecar')h.agent.scratchpad.goalSidecarFor='root';if(role==='unclaimed')delete h.agent.currentJobId;
 let requests=0;h.ctx.fns.llm.stream=async()=>++requests===1?{toolCalls:[{id:'t',name:'work',args:{}}],usage:{}}:{text:'done',usage:{}};
 h.ctx.fns.tools.call=async()=>{expect(h.invocation().action).toBe('clear');expect(h.invocation().binding).toBeUndefined();return {handlerExecuted:true,output:'ok'};};await h.execute(role==='descendant'?{goalAuthority:authority}:{});expect(requests).toBe(2);
});


for (const status of ['paused','complete','blocked']) test(`native ${status} closes batch even without post-tool checkpoint`,async()=>{
 const h=nativeFixture();let requests=0,calls=0;
 h.ctx.fns.llm.stream=async()=>{requests++;return {toolCalls:[{id:'t',name:'update_goal',args:{}},{id:'u',name:'work',args:{}}],usage:{}};};
 h.ctx.fns.tools.call=async()=>{calls++;await h.invocation().onMutation({goalId:'g',revision:3,status});return {handlerExecuted:false,isError:true,output:'committed then envelope failed'};};
 await h.execute();expect(calls).toBe(1);expect(requests).toBe(1);
});

