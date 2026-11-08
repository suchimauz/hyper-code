import {expect,test} from 'bun:test';
import run from './run';
import barrier from '../goal/ownerBarrier';
function harness(turns:any[],status='active'){
 const messages:any[]=[],calls:any[]=[];
 const agent:any={id:'a',currentRunToken:'token',scratchpad:{},messages:[],events:[],model:'openai:test'};
 const state:any={binding:{rootAgentId:'a',sourceAgentId:'a',goalId:'g',runToken:'token'},pendingRequests:new Set(),sealed:false};
 const noop=async()=>{};
 let idx=0;
 const ctx:any={state:{},fns:{
 input:{isWaiting:async()=>false},
 planning:{read:async({agentId}:any)=>({version:1,agentId,mode:'execute',revision:0,scope:'session',advisory:true,runningPolicy:'reject',pending:null,proposal:null})},
 session:{forAgent:()=>({}),appendUserMessage:noop,appendMessage:async({message}:any)=>{messages.push(message);return {idx:idx++}},syncAgentState:noop,updateMessageContent:noop,appendAssistantEvent:async()=>({idx:idx++}),appendToolCallEvent:noop,recordContextUsage:noop,appendErrorEvent:noop},
 agent:{recordRunLifecycle:noop,statusLineForTurn:async()=>'',autoCompactIfNeeded:async()=>({status:'not_needed'}),stashResult:async({output}:any)=>({content:output}),sanitizeHtmlBody:({html}:any)=>html},
 procs:{db:{select:async()=>[{i:0,stopped_at:null,run_state:'running',run_token:'token'}]},events:{emit:noop},log:{warn:noop}},
 goal:{ownerBarrier:(o:any)=>barrier(ctx,null,o),delegationScope:async({fn}:any)=>fn(),forkRelease:async(o:any)=>{expect(calls[0][0]).toBe('capture');expect(o.baselineAvailable).toBe(true);expect(o.goalId).toBe(state.binding.goalId);return false;},runBindingCapture:async(o:any)=>{calls.push(['capture',o]);return {kind:'bound',state}},runStopRegistry:noop,runUsageRecord:async(o:any)=>{calls.push(['usage',o]);state.pendingRequests.delete(o.requestId);if(o.format==='unsupported')state.blocked=true;return {kind:'recorded'}},runCheckpointFlush:async()=>{calls.push(['flush']);return state.blocked?{kind:'blocked',allowContinuation:false}:{kind:'committed',checkpointId:'receipt-'+calls.filter(c=>c[0]==='flush').length,sequence:calls.filter(c=>c[0]==='flush').length,revision:7,budgetTransition:status==='budget_limited',status,allowContinuation:status==='active'}},budgetSteer:async()=>{calls.push(['steer'])}},
 llm:{resolveEndpoint:async()=>({provider:'openai',api:'openai'}),stream:async()=>{expect(state.pendingRequests.size).toBe(1);const t=turns.shift();if(t instanceof Error)throw t;return t}},markdown:{render:async({source}:any)=>source},tools:{call:async({name}:any)=>({handlerExecuted:true,output:'ok',...(name==='respondHtml'?{terminal:{type:'html',text:'final',html:'<p>final</p>'}}:{})})
 }}};
 return {calls,messages,agent,state,ctx,execute:(extra:any={})=>run(ctx,null,{agent,userText:'question',...extra})};
}
test('ordinary final checkpoints but cannot continue without native goal tool',async()=>{const h=harness([{text:'answer',usage:{prompt_tokens:4}}]);const result=await h.execute();expect(result.goalContinuation).toBeUndefined();expect(h.calls.map(c=>c[0])).toEqual(['capture','usage','flush','flush']);expect(h.calls[1][1].format).toBe('openai-chat');});
test('terminal HTML includes pre-tool and final checkpoints without budget steering',async()=>{const h=harness([{toolCalls:[{id:'t',name:'respondHtml',args:{}}],usage:{}}]);const result=await h.execute();expect(result.terminal).toBe(true);expect(result.goalContinuation).toBeUndefined();expect(h.calls.filter(c=>c[0]==='flush').length).toBe(3);expect(h.calls.some(c=>c[0]==='steer')).toBe(false);});
test('failed request records unsupported before finally and preserves original failure',async()=>{const h=harness([new Error('provider exploded')]);await expect(h.execute()).rejects.toThrow('provider exploded');expect(h.calls.map(c=>c[0])).toEqual(['capture','usage','flush']);expect(h.calls[1][1].format).toBe('unsupported');expect(h.state.pendingRequests.size).toBe(0);expect(h.agent.abortController).toBeNull();});
test('disabled feature leaves ordinary return and provider path unchanged',async()=>{const h=harness([{text:'answer'}]);h.ctx.fns.goal.runBindingCapture=async()=>({kind:'disabled',allowContinuation:false});h.ctx.fns.llm.stream=async()=>({text:'answer'});const result=await h.execute();expect(result.goalContinuation).toBeUndefined();expect(h.calls).toEqual([]);});
test('worker binding hook precedes execution, is frozen and survives thrown provider errors',async()=>{
 const error=Object.freeze(new Error('provider exploded'));const h=harness([error]);h.state.binding.sourceAgentId='a';
 const bindings:any[]=[];const stream=h.ctx.fns.llm.stream;h.ctx.fns.llm.stream=async()=>{expect(bindings).toHaveLength(1);return stream();};
 await expect(run(h.ctx,null,{agent:h.agent,userText:'question',onGoalBinding:b=>bindings.push(b)})).rejects.toBe(error);
 expect(bindings).toEqual([{goalId:'g',runToken:'token'}]);expect(Object.isFrozen(bindings[0])).toBe(true);
});
for(const mode of ['setup','descendant','authority','disabled'])test(`worker binding hook excludes ${mode}`,async()=>{
 const h=harness([{text:'answer',usage:{}}]);h.state.binding.sourceAgentId='a';const bindings:any[]=[];
 if(mode==='setup')h.ctx.fns.goal.forkRelease=async()=>{throw new Error('admission denied');};
 if(mode==='descendant')h.state.binding.rootAgentId='parent';
 if(mode==='authority')h.state.binding.authority={rootAgentId:'a'};
 if(mode==='disabled'){h.ctx.fns.goal.runBindingCapture=async()=>({kind:'disabled'});h.ctx.fns.llm.stream=async()=>({text:'answer'});}
 const result=run(h.ctx,null,{agent:h.agent,userText:'question',onGoalBinding:b=>bindings.push(b)});
 if(mode==='setup')await expect(result).rejects.toThrow('admission denied');else await result;
 expect(bindings).toEqual([]);
});

for(const kind of ['disabled','excluded','absent','blocked'])test(`required descendant rejects ${kind} capture without model`,async()=>{
 const h=harness([]);let models=0;h.ctx.fns.goal.runBindingCapture=async(o:any)=>{expect(Object.isFrozen(o.authority)).toBe(true);return {kind,allowContinuation:false};};h.ctx.fns.llm.stream=async()=>{models++;return {};};
 const result=await run(h.ctx,null,{agent:h.agent,userText:'question',goalAuthority:{sourceAgentId:'a'} as any});
 expect(result.goalAdmissionBlocked).toBe(true);expect(models).toBe(0);
});
for(const status of ['active','budget_limited'])test(`descendant ${status} controls tools independently of continuation`,async()=>{
 const h=harness([{toolCalls:[{id:'t',name:'respondHtml',args:{}}],usage:{}}],status);let tools=0,scopes=0;
 h.state.binding.authority={sourceAgentId:'a'};h.state.binding.rootAgentId='root';
 h.ctx.fns.goal.forkRelease=async()=>{throw new Error('descendant must not release child fork');};
 h.ctx.fns.goal.runCheckpointFlush=async()=>({kind:'committed',status,revision:1,allowContinuation:false});
 const call=h.ctx.fns.tools.call;h.ctx.fns.tools.call=async(o:any)=>{tools++;return call(o);};
 h.ctx.fns.goal.delegationScope=async({binding,fn}:any)=>{expect(binding).toBe(h.state.binding);scopes++;return fn();};
 const result=await run(h.ctx,null,{agent:h.agent,userText:'question',goalAuthority:h.state.binding.authority});
 expect(tools).toBe(status==='active'?1:0);expect(scopes).toBe(tools);expect(result.goalContinuation).toBeUndefined();
});
test('trusted callback exposes only final drained immutable receipt',async()=>{const h=harness([{text:'answer',usage:{prompt_tokens:4}}]);const proofs:any[]=[];await h.execute({onGoalFinalCheckpoint:(p:any)=>proofs.push(p)});expect(proofs).toHaveLength(1);expect(Object.isFrozen(proofs[0])).toBe(true);expect(proofs[0].sourceRunToken).toBe('token');expect(proofs[0].checkpointId).toBe('receipt-'+h.calls.filter(c=>c[0]==='flush').length);expect(proofs[0].drained).toBe(true);});
test('failed turn with unknown usage never supplies final receipt',async()=>{const h=harness([new Error('provider failed')]);const proofs:any[]=[];await expect(h.execute({onGoalFinalCheckpoint:(p:any)=>proofs.push(p)})).rejects.toThrow();expect(proofs).toEqual([]);});

test('cycle reserves through tool handler and final flush then releases on terminal response',async()=>{
 const h=harness([{text:'',toolCalls:[{id:'c',name:'respondHtml',args:{}}],usage:{prompt_tokens:4}}]);
 const busy=()=>h.ctx.fns.goal.ownerBarrier({agentId:'a',runToken:'token',action:'acquire'});
 const tool=h.ctx.fns.tools.call;
 h.ctx.fns.tools.call=async(o:any)=>{expect(await busy()).toBeNull();return tool(o);};
 const flush=h.ctx.fns.goal.runCheckpointFlush;
 h.ctx.fns.goal.runCheckpointFlush=async()=>{await Promise.resolve();expect(await busy()).toBeNull();return flush();};
 await h.execute();expect(await busy()).not.toBeNull();
});
test('provider error keeps reservation through final flush and releases afterward',async()=>{
 const h=harness([new Error('provider failed')]);
 const flush=h.ctx.fns.goal.runCheckpointFlush;
 h.ctx.fns.goal.runCheckpointFlush=async()=>{await Promise.resolve();expect(await h.ctx.fns.goal.ownerBarrier({agentId:'a',runToken:'token',action:'acquire'})).toBeNull();return flush();};
 await expect(h.execute()).rejects.toThrow('provider failed');
 expect(await h.ctx.fns.goal.ownerBarrier({agentId:'a',runToken:'token',action:'acquire'})).not.toBeNull();
});
test('sealed old binding cannot dispatch or recapture replacement',async()=>{
 const h=harness([{text:'must not run',usage:{}}]);h.ctx.fns.goal.runStopRegistry=async()=>{h.state.sealed=true;};
 await expect(h.execute()).rejects.toThrow('closed');
 expect(h.calls.filter(c=>c[0]==='capture')).toHaveLength(1);expect(h.calls.filter(c=>c[0]==='usage')).toHaveLength(0);
 expect(await h.ctx.fns.goal.ownerBarrier({agentId:'a',runToken:'token',action:'acquire'})).not.toBeNull();
});

test('capture read failure stops root before a successful second read or dispatch',async()=>{
 const h=harness([]);h.agent.currentJobId='token';let reads=0,dispatches=0;
 h.ctx.fns.goal.runBindingCapture=async()=>({kind:'blocked',reason:'transient read failure'});
 h.ctx.fns.goal.read=async()=>{reads++;return {enabled:true,goal:{goalId:'g',status:'active'}}};
 h.ctx.fns.llm.stream=async()=>{dispatches++;return {text:'bad'}};
 expect((await h.execute()).goalAdmissionBlocked).toBe(true);expect(reads).toBe(0);expect(dispatches).toBe(0);
});
for(const status of ['paused','complete','budget_limited'])test(`confirmed ${status} allows ordinary chat without accounting`,async()=>{
 const h=harness([]);h.agent.currentJobId='token';let dispatches=0;
 h.ctx.fns.goal.runBindingCapture=async()=>({kind:'inactive',goalId:'g'});
 h.ctx.fns.goal.read=async()=>({enabled:true,goal:{goalId:'g',status,revision:1}});
 h.ctx.fns.llm.stream=async()=>{dispatches++;return {text:'ordinary'}};
 await h.execute();expect(dispatches).toBe(1);expect(h.calls).toEqual([]);
});
for(const role of ['fork','descendant','sidecar'])test(`${role} receives only its authorized native scope`,async()=>{
 const h=harness([{toolCalls:[{id:'t',name:'respondHtml',args:{}}],usage:{}}]);h.agent.currentJobId='token';h.agent.parentId='ancestor';
 h.ctx.fns.goal.read=async({agentId}:any)=>{expect(agentId).toBe('a');return {enabled:true,goal:{goalId:'g',status:'active',revision:1}}};
 if(role==='sidecar')h.agent.scratchpad.goalSidecarFor='ancestor';
 const scopes:any[]=[];h.ctx.fns.goal.toolScope=async(o:any)=>{scopes.push(o);return o.fn()};
 await h.execute(role==='descendant'?{goalAuthority:{rootAgentId:'ancestor'}}:{});
 expect(scopes).toHaveLength(1);expect(scopes[0].action).toBe(role==='fork'?'with':'clear');
 if(role==='fork'){expect(scopes[0].binding.ownerAgentId).toBe('a');expect(scopes[0].binding.expectedGoalId).toBe('g');}
});
test('initial identity drift rejects before provider work',async()=>{
 const h=harness([]);h.agent.currentJobId='token';let dispatches=0;
 h.ctx.fns.goal.read=async()=>({enabled:true,goal:{goalId:'replacement',status:'active'}});
 h.ctx.fns.llm.stream=async()=>{dispatches++;return {text:'bad'}};
 await expect(h.execute()).rejects.toThrow('handoff failed');expect(dispatches).toBe(0);
});
for(const api of ['anthropic','responses','gemini','mock','unknown'])test(`bound ${api} fails before network`,async()=>{
 const h=harness([]);let dispatches=0;h.ctx.fns.llm.resolveEndpoint=async()=>({provider:'openai',api});
 h.ctx.fns.llm.stream=async()=>{dispatches++;return {text:'bad'}};
 await expect(h.execute()).rejects.toThrow('exact supported transport');expect(dispatches).toBe(0);
});

test('inactive capture cannot race into an unaccounted active goal',async()=>{
 const h=harness([]);h.agent.currentJobId='token';let dispatches=0;
 h.ctx.fns.goal.runBindingCapture=async()=>({kind:'inactive',goalId:'g'});
 h.ctx.fns.goal.read=async()=>({enabled:true,goal:{goalId:'g',status:'active'}});
 h.ctx.fns.llm.stream=async()=>{dispatches++;return {text:'bad'}};
 await expect(h.execute()).rejects.toThrow('handoff failed');expect(dispatches).toBe(0);
});
for(const provider of ['xai','hyper'])test(`bound ${provider} xai adapter fails before network`,async()=>{
 const h=harness([]);let dispatches=0;h.ctx.fns.llm.resolveEndpoint=async()=>({provider,upstream:'xai',api:'openai'});
 h.ctx.fns.llm.stream=async()=>{dispatches++;return {text:'bad'}};
 await expect(h.execute()).rejects.toThrow('exact supported transport');expect(dispatches).toBe(0);
});

for (const rogueTools of [false,true]) test(`successful native completion permits one report only (rogue tools=${rogueTools})`,async()=>{
 const h=harness([{toolCalls:[{id:'done',name:'update_goal',args:{}},{id:'later',name:'bash',args:{}}],usage:{}},{text:'Completed the requested fix.',usage:{},...(rogueTools?{toolCalls:[{id:'rogue',name:'bash',args:{}}]}:{})}]);
 h.agent.currentJobId='token';
 h.ctx.fns.goal.read=async()=>({enabled:true,goal:{goalId:'g',status:'active',revision:1}});
 let completed=false;const executed:string[]=[];
 h.ctx.fns.goal.read=async()=>({enabled:true,goal:{goalId:'g',status:completed?'complete':'active',revision:1,tokenBudget:null,tokensUsed:10}});
 h.ctx.fns.goal.toolScope=async(o:any)=>{const result=await o.fn();completed=true;await o.onMutation({goalId:'g',status:'complete',revision:8});return result;};
 h.ctx.fns.tools.call=async({name}:any)=>{executed.push(name);return {handlerExecuted:true,output:'Goal complete'};};
 const flush=h.ctx.fns.goal.runCheckpointFlush;
 h.ctx.fns.goal.runCheckpointFlush=async()=>({...await flush(),status:completed?'complete':'active',allowContinuation:!completed});
 const result=await h.execute();
 expect(executed).toEqual(['update_goal']);expect(h.calls.filter(c=>c[0]==='usage')).toHaveLength(2);
 expect(result.text).toBe('Completed the requested fix.');expect(result.goalContinuation).toBeUndefined();
 expect(h.messages.filter(m=>m.role==='assistant' && m.content)).toEqual([expect.objectContaining({content:'Completed the requested fix.'})]);
});
for(const status of ['paused','blocked','budget_limited']) test(`${status} stops without tools, continuation or duplicate boundary prose`,async()=>{
 const h=harness([{text:'should not be delivered',toolCalls:[{id:'work',name:'bash',args:{}}],usage:{}}],status);
 let tools=0;h.ctx.fns.tools.call=async()=>{tools++;};const result=await h.execute();
 expect(tools).toBe(0);expect(result.text).toBe('');expect(result.goalContinuation).toBeUndefined();expect(h.messages).toHaveLength(0);
});
test('accounting failure remains observable and fail closed',async()=>{
 const h=harness([{toolCalls:[{id:'work',name:'bash',args:{}}],usage:{}}]);let tools=0;const errors:string[]=[];
 h.ctx.fns.goal.runCheckpointFlush=async()=>({kind:'blocked',allowContinuation:false});
 h.ctx.fns.tools.call=async()=>{tools++;};h.ctx.fns.session.appendErrorEvent=async({error}:any)=>{errors.push(error);};
 const result=await h.execute();expect(tools).toBe(0);expect(errors).toHaveLength(1);expect(result.text).toContain('accounting');expect(result.goalContinuation).toBeUndefined();
});
for(const mode of ['budget','accounting','report-error']) test(`completion receipt does not bypass ${mode}`,async()=>{
 const h=harness([{toolCalls:[{id:'done',name:'update_goal',args:{}}],usage:{}},new Error('receipt failed')]);h.agent.currentJobId='token';let completed=false;
 h.ctx.fns.goal.read=async()=>({enabled:true,goal:{goalId:'g',status:completed?'complete':'active',revision:1,tokenBudget:mode==='budget'?10:null,tokensUsed:10}});
 h.ctx.fns.goal.toolScope=async(o:any)=>{const r=await o.fn();completed=true;await o.onMutation({goalId:'g',status:'complete',revision:8});return r;};
 const flush=h.ctx.fns.goal.runCheckpointFlush;h.ctx.fns.goal.runCheckpointFlush=async()=>completed&&mode==='accounting'?{kind:'blocked',allowContinuation:false}:{...await flush(),status:completed?'complete':'active',allowContinuation:!completed};
 if(mode==='report-error')await expect(h.execute()).rejects.toThrow('receipt failed');else {const result=await h.execute();expect(result.goalContinuation).toBeUndefined();}
 expect(h.calls.filter(c=>c[0]==='usage')).toHaveLength(mode==='report-error'?2:1);
});
