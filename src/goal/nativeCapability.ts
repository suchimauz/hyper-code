/**
 * Check installed native goal tools on the owner effective wire surface
 *
 * Fail closed before autonomous goal scheduling. Reserved contract uses empty get_goal and update_goal with status complete, paused or blocked only; identity, revision and run token are injected by the trusted wrapper. Loaded handlers, schema validation and owner narrowing are required. All model providers and transports use the shared trusted tool dispatch and usage-accounting lifecycle; capability is determined by the effective tool surface, not provider identity. Does not grant authority from lineage or client flags.
 * @param opts.agentId Exact owner whose live model and tool allowlist are inspected.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact owner whose live model and tool allowlist are inspected. */
        agentId: string;
    },
): Promise<{available:boolean;reason:string;fingerprint:string|null}> {
    const fail=(reason:string)=>({available:false,reason,fingerprint:null});
    const owner=ctx.state.agent[opts.agentId];
    if(!owner) return fail('owner_not_loaded');
    const contracts=[{key:'goal.get_goal',fn:'goal.toolGet',parameters:{type:'object',properties:{},required:[],additionalProperties:false}},{key:'goal.update_goal',fn:'goal.toolUpdate',parameters:{type:'object',properties:{status:{type:'string',enum:['complete','paused','blocked']}},required:['status'],additionalProperties:false}}];
    const canonical=(v:any):string=>JSON.stringify(v,(_k,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
    const all=ctx.fns.tools.list({});
    const selected=[];
    for(const contract of contracts){
    const tool=all.find(t=>t.key===contract.key);
    if(!tool||tool.fn!==contract.fn) return fail('native_goal_tools_unavailable');
    const handler=String(tool.fn).split('.').reduce((node:any,key:string)=>node?.[key],ctx.state.registry);
    if(typeof handler!=='function'||typeof ctx.fns.tools.validate!=='function') return fail('native_goal_handler_unavailable');
    if(tool.validate){const validator=String(tool.validate).split('.').reduce((node:any,key:string)=>node?.[key],ctx.state.registry);if(typeof validator!=='function')return fail('native_goal_validator_unavailable');}
    if(canonical(tool.parameters)!==canonical(contract.parameters))return fail('native_goal_schema_mismatch');
    selected.push(tool);
    }
    const ep=await ctx.fns.llm.resolveEndpoint({model:owner.model});
    // Match llm.stream's effective dialect: xAI uses Responses even through
    // Hyper, while Gemini converts the OpenAI declarations to native tools.
    const api=ep.api==='gemini'?'openai':ep.api==='anthropic'?'anthropic':(ep.provider==='hyper'?ep.upstream:ep.provider)==='xai'?'responses':ep.api;
    const wire=ctx.fns.agent.wireTools({agent:owner,api});
    for(const tool of selected){const declaration=wire.find(t=>(t.function?.name??t.name)===tool.wireName);if(!declaration||canonical(declaration.function?.parameters??declaration.parameters??declaration.input_schema)!==canonical(tool.parameters))return fail('native_goal_tools_filtered');}
    return {available:true,reason:'available',fingerprint:String(Bun.hash(canonical({model:owner.model,api,tools:selected.map(t=>({key:t.key,fn:t.fn,wireName:t.wireName,parameters:t.parameters}))})))};
}
