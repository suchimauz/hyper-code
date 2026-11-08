/**
 * Capture current tool authority or reject unaccounted Goal delegation
 *
 * Internal publication gate before constructing a child. Requires run-owned scope and exact live accounting registry; absent ordinary goals remain unchanged. Durable marker never permits ordinary fallback even when Goal is disabled.
 * @param opts.agentId Requested delegator, which must equal the invocation source.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Requested delegator, which must equal the invocation source. */
        agentId: string;
    },
): Promise<Readonly<{rootAgentId:string;goalId:string;sourceAgentId:string;runToken:string;parentCapabilityId?:string}> | undefined> {
    const a = await ctx.fns.goal.delegationScope({action:'read'}) as Readonly<{rootAgentId:string;goalId:string;sourceAgentId:string;runToken:string;parentCapabilityId?:string}> | undefined;
    if(a){
     if(a.sourceAgentId!==opts.agentId) throw new Error('Delegator does not match current run');
     const state=await ctx.fns.goal.runStopRegistry({action:'get',agentId:a.sourceAgentId,runToken:a.runToken});
     if(!state || state.sealed || state.blocked || state.binding.sourceAgentId!==a.sourceAgentId || state.binding.runToken!==a.runToken || state.binding.goalId!==a.goalId || state.binding.rootAgentId!==a.rootAgentId || state.binding.authority?.capabilityId!==a.parentCapabilityId) throw new Error('Delegation accounting authority is unavailable');
     return a;
    }
    const [row]=await ctx.fns.procs.db.select({sql:"SELECT to_jsonb(a)->>'goal_delegation_required' AS required FROM agents a WHERE id=?",params:[opts.agentId]});
    if(!row || row.required==='true') throw new Error('Delegation requires captured run authority');
    if(await ctx.fns.goal.enabled({})) {const g=await ctx.fns.goal.read({agentId:opts.agentId});if(g.enabled&&g.goal) throw new Error('Goal delegation requires captured run authority');}
    return undefined;
}
