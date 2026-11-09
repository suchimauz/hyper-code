/**
 * Atomically reserve and queue the first turn of a Goal child
 *
 * Internal Goal-only publication path. Constructs an unpublished child through existing fork/start, reserves under captured live delegator authority, and persists task and schedule in one transaction. Publishes live state and notifications only after commit. One-shot reservation only: later turns remain blocked rather than clearing the required marker.
 * @param opts.parent Delegator matching the run-owned invocation scope.
 * @param opts.title Optional child title.
 * @param opts.forkContext Inherit full transcript when true; false constructs a fresh child. Omit for a zero-offset fork.
 * @param opts.prompt First delegated task message persisted with internal delegation_task provenance.
 * @param opts.scratchpad Delegation metadata persisted on the new child; never authority.
 * @param opts.tasks Optional native visible plan initialized inside the transaction.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Delegator matching the run-owned invocation scope. */
        parent: types.agent.Agent;
        /** Optional child title. */
        title?: string;
        /** Inherit full transcript when true; false constructs a fresh child. Omit for a zero-offset fork. */
        forkContext?: boolean;
        /** First delegated task message persisted with internal delegation_task provenance. */
        prompt: string;
        /** Delegation metadata persisted on the new child; never authority. */
        scratchpad: Record<string, unknown>;
        /** Optional native visible plan initialized inside the transaction. */
        tasks?: Array<{id:string;title:string;instructions?:string}>;
    },
): Promise<{id:string}> {
    const a=await ctx.fns.goal.delegationCapture({agentId:opts.parent.id});
    if(!a) throw new Error('Goal publication requires invocation authority');
    const child = await ctx.fns.procs.db.transaction({fn:async()=>{
     const child=opts.forkContext===false
     ? await ctx.fns.agent.start({model:opts.parent.model,systemPrompt:opts.parent.systemPrompt,workspaceDir:opts.parent.workspaceDir,workspaceHost:opts.parent.workspaceHost,visibility:'team',deferPublication:true})
     : await ctx.fns.session.fork({id:a.sourceAgentId,title:opts.title,visibility:'team',...(opts.forkContext?{}:{offset:0}),deferPublication:true});
     const reservation=await ctx.fns.goal.delegationReserve({rootAgentId:a.rootAgentId,goalId:a.goalId,delegatorAgentId:a.sourceAgentId,delegatorRunToken:a.runToken,sourceAgentId:child.id,parentCapabilityId:a.parentCapabilityId});
     child.scratchpad={...opts.scratchpad};
     await ctx.fns.session.updateScratchpad({id:child.id,scratchpad:child.scratchpad});
     if(opts.tasks) await ctx.fns.session.plan({agent:child,title:opts.title,tasks:opts.tasks,deferPublication:true});
     const ts=Date.now();
     const message=await ctx.fns.session.appendMessage({id:child.id,message:{role:'user',content:opts.prompt,author:'agent:'+a.sourceAgentId,message_type:'delegation_task'},ts});
     await ctx.fns.goal.delegationPublish({reservationId:reservation.reservationId,delegatorRunToken:a.runToken,authorizedThroughIdx:message.idx});
     const event={type:'user',text:opts.prompt,messageIdx:message.idx,ts,actor:'agent:'+a.sourceAgentId};

     await ctx.fns.session.appendEvent({id:child.id,event,ts,deferPublication:true});
     await ctx.fns.procs.db.run({sql:'UPDATE agents SET next_run_at=?,updated_at=? WHERE id=?',params:[ts,ts,child.id]});
     return child;
    }}) as types.agent.Agent;
    // Durable commit is authoritative. Notification errors must not invite a retry.
    ctx.state.agent ??= {};
    ctx.state.agent[child.id]=child;
    for(const notify of [async()=>{await ctx.fns.session.syncAgentState({agent:child});},async()=>{await ctx.fns.events.emitAgentsChanged({agentId:child.id,reason:'delegate'});},async()=>{await ctx.fns.events.refreshAgentMeta({agentId:a.sourceAgentId,section:'team',reason:'delegate'});},async()=>{await ctx.fns.agent.wakeWorker({});}]) {
     try{await notify();}catch(error){console.error('Committed Goal delegation notification failed',child.id,error);}
    }
    return {id:child.id};
}
