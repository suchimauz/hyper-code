import {test,expect} from 'bun:test';
import capability from './nativeCapability';
import list from '../tools/list';
import schemas from '../tools/schemas';
import wireTools from '../agent/wireTools';
function fixture(){
 const declarations=[{key:'goal.get_goal',module:'goal',name:'get_goal',fn:'goal.toolGet',parameters:{type:'object',properties:{},required:[],additionalProperties:false}},{key:'goal.update_goal',module:'goal',name:'update_goal',fn:'goal.toolUpdate',parameters:{type:'object',properties:{status:{type:'string',enum:['complete','paused','blocked']}},required:['status'],additionalProperties:false}}];
 const owner:any={id:'a',model:'openai:test'};
 const ctx:any={state:{agent:{a:owner},registry:{goal:{toolGet:()=>{},toolUpdate:()=>{}}},tools:{registry:new Map(declarations.map(t=>[t.key,t]))}},fns:{tools:{validate:()=>({ok:true})},agent:{},llm:{resolveEndpoint:async()=>({api:'openai',provider:'openai'})}}};
 ctx.fns.tools.list=(o:any)=>list(ctx,null,o);ctx.fns.tools.schemas=(o:any)=>schemas(ctx,null,o);ctx.fns.agent.wireTools=(o:any)=>wireTools(ctx,null,o);
 return {ctx,owner,declarations};
}
test('installed handlers and actual registry/wire surface enable capability',async()=>{const f=fixture();expect(await capability(f.ctx,null,{agentId:'a'})).toMatchObject({available:true,reason:'available'});});
test('missing production wrappers fail closed',async()=>{const f=fixture();f.ctx.state.tools.registry.clear();expect((await capability(f.ctx,null,{agentId:'a'})).available).toBe(false);});
test('fabricated proxy function is not loaded implementation',async()=>{const f=fixture();delete f.ctx.state.registry.goal.toolUpdate;f.ctx.fns.goal={toolUpdate:()=>{}};expect((await capability(f.ctx,null,{agentId:'a'})).reason).toBe('native_goal_handler_unavailable');});
test('unsafe active model schema fails closed',async()=>{const f=fixture();f.declarations[1]!.parameters.properties.status!.enum.push('active');expect((await capability(f.ctx,null,{agentId:'a'})).reason).toBe('native_goal_schema_mismatch');});
test('owner filtering and unsupported transport fail closed',async()=>{const f=fixture();f.owner.tools=['get_goal'];expect((await capability(f.ctx,null,{agentId:'a'})).reason).toBe('native_goal_tools_filtered');delete f.owner.tools;f.ctx.fns.llm.resolveEndpoint=async()=>({api:'mock',provider:'mock'});expect((await capability(f.ctx,null,{agentId:'a'})).reason).toBe('native_transport_unavailable');});
test('declared validator must actually be loaded',async()=>{const f=fixture();Object.assign(f.declarations[1]!,{validate:'goal.validateUpdate'});expect((await capability(f.ctx,null,{agentId:'a'})).reason).toBe('native_goal_validator_unavailable');});
for (const api of ['anthropic', 'responses']) test(`native ${api} tools cannot admit unsupported exact accounting`, async () => {
 const f=fixture(); f.ctx.fns.llm.resolveEndpoint=async()=>({api,provider:api});
 expect((await capability(f.ctx,null,{agentId:'a'})).reason).toBe('native_transport_unavailable');
});

for (const provider of ['xai','hyper']) test(`transformed ${provider} cannot admit exact accounting`, async () => {
 const f=fixture(); f.ctx.fns.llm.resolveEndpoint=async()=>({api:'openai',provider,upstream:'xai'});
 expect((await capability(f.ctx,null,{agentId:'a'})).reason).toBe('native_transport_unavailable');
});
