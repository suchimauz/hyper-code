import {test,expect} from 'bun:test';
import scope from './toolScope';
import get from './toolGet';
import update from './toolUpdate';
import create from './toolCreate';
import validate from '../tools/validate';
function fixture(){
 const calls:any[]=[]; const results:any[]=[];
 const binding:any={sourceAgentId:'root',ownerAgentId:'root',runToken:'captured',role:'root',expectedGoalId:'g',expectedRevision:4,maxTokenBudget:100};
 const ctx:any={state:{agent:{root:{currentJobId:'mutable-other'}}},fns:{goal:{}}};
 ctx.fns.goal.enabled=async()=>true;
 ctx.fns.goal.toolScope=(o:any)=>scope(ctx,null,o);
 ctx.fns.goal.read=async(o:any)=>{calls.push(o);return {enabled:true,goal:{goalId:'new-read',revision:99}}};
 ctx.fns.goal.modelUpdate=ctx.fns.goal.modelCreate=async(o:any)=>{calls.push(o);return {goalId:'result',revision:5}};
 const invoke=(fn:()=>Promise<unknown>,b=binding,onMutation:any=async(g:any)=>{results.push(g)})=>scope(ctx,null,{action:'with',binding:b,onMutation,fn});
 return {ctx,calls,results,binding,invoke};
}
test('absent create passes immutable claim, CAS and host cap with postcommit handoff',async()=>{const f=fixture();f.binding.expectedGoalId=null;f.binding.expectedRevision=null;await f.invoke(async()=>{f.binding.runToken='changed';await create(f.ctx,null,{objective:'explicit',token_budget:12});});expect(f.calls).toEqual([{agentId:'root',expectedGoalId:null,expectedRevision:null,runToken:'captured',objective:'explicit',tokenBudget:12,maxTokenBudget:100}]);expect(f.results).toEqual([{goalId:'result',revision:5}]);});
test('read does not replace observed revision used for later update',async()=>{const f=fixture();await f.invoke(async()=>{await get(f.ctx,null,{});await update(f.ctx,null,{status:'complete'});});expect(f.calls[1]).toEqual({agentId:'root',expectedGoalId:'g',expectedRevision:4,runToken:'captured',status:'complete'});});
test('scope isolation, immutable capture and inherited scope clear',async()=>{const f=fixture();await f.invoke(async()=>{const s:any=await scope(f.ctx,null,{action:'read'});expect(Object.isFrozen(s)).toBe(true);await scope(f.ctx,null,{action:'clear',fn:async()=>{expect(await scope(f.ctx,null,{action:'read'})).toBeUndefined();}});expect(await scope(f.ctx,null,{action:'read'})).toBe(s);});expect(await scope(f.ctx,null,{action:'read'})).toBeUndefined();});
test('unscoped, descendant, sidecar and mismatched owner writes fail closed',async()=>{for(const b of [null,{role:'descendant'},{role:'sidecar'},{sourceAgentId:'child'}]){const f=fixture();const fn=()=>update(f.ctx,null,{status:'paused'});await expect(b?f.invoke(fn,{...f.binding,...b}):fn()).rejects.toThrow();expect(f.calls).toEqual([]);}});
test('no postcommit handoff means no mutation',async()=>{const f=fixture();await expect(scope(f.ctx,null,{action:'with',binding:f.binding,fn:()=>create(f.ctx,null,{objective:'x'})})).rejects.toThrow('postcommit');expect(f.calls).toEqual([]);});
test('persistence conflict never publishes mutation',async()=>{const f=fixture();f.ctx.fns.goal.modelUpdate=async()=>{throw new Error('stale revision')};await expect(f.invoke(()=>update(f.ctx,null,{status:'blocked'}))).rejects.toThrow('stale');expect(f.results).toEqual([]);});
test('postcommit handoff failure reports committed state and preserves cause',async()=>{for(const fn of [update,create]){const f=fixture();const cause=new Error('accounting handoff failed');try{await f.invoke(()=>fn(f.ctx,null,(fn===update?{status:'complete'}:{objective:'explicit'}) as any),f.binding,async()=>{throw cause});throw new Error('expected failure');}catch(e:any){expect(e.message).toContain('Goal mutation committed:');expect(e.message).toContain('"goalId":"result"');expect(e.message).toContain('do not retry');expect(e.cause).toBe(cause);}expect(f.calls).toHaveLength(1);}});
test('disabled adapters never touch storage or handoff',async()=>{const f=fixture();f.ctx.fns.goal.enabled=async()=>false;expect(await get(f.ctx,null,{})).toEqual({enabled:false});await expect(f.invoke(()=>update(f.ctx,null,{status:'complete'}))).rejects.toThrow('disabled');await expect(f.invoke(()=>create(f.ctx,null,{objective:'x'}))).rejects.toThrow('disabled');expect(f.calls).toEqual([]);expect(f.results).toEqual([]);});
test('reject authority injection, active resume, unsafe budgets and invalid objectives',async()=>{const f=fixture();for(const args of [{status:'active'},{status:'paused',runToken:'forged'},{status:'complete',agentId:'victim'}])await expect(f.invoke(()=>update(f.ctx,null,args as any))).rejects.toThrow();for(const args of [{objective:'x',token_budget:0},{objective:'x',token_budget:1.2},{objective:'x',token_budget:Number.MAX_SAFE_INTEGER+1},{objective:' '},{objective:'x',expectedRevision:1}])await expect(f.invoke(()=>create(f.ctx,null,args as any))).rejects.toThrow();await expect(f.invoke(()=>get(f.ctx,null,{agentId:'x'} as any))).rejects.toThrow();expect(f.calls).toEqual([]);});
test('actual declarations have reserved safe native schemas',async()=>{const declarations:any={};for(const n of ['get_goal','update_goal','create_goal']){const text=await Bun.file(`${import.meta.dir}/$tool_${n}.md`).text();declarations[n]=(Bun.YAML.parse(text.split('---')[1]!) as any);expect(declarations[n].parameters.additionalProperties).toBe(false);}
 expect(declarations.get_goal.parameters).toEqual({type:'object',properties:{},required:[],additionalProperties:false});expect(declarations.update_goal.parameters).toEqual({type:'object',properties:{status:{type:'string',enum:['complete','paused','blocked']}},required:['status'],additionalProperties:false});
 for(const [name,args] of [['get_goal',{agentId:'x'}],['update_goal',{status:'active'}],['create_goal',{objective:'x',runToken:'x'}],['create_goal',{objective:'x',token_budget:1.5}]] as const)expect(validate({} as any,null,{schema:declarations[name].parameters,args}).ok).toBe(false);
});
