/**
 * Publish planning state invalidation after a committed transition
 *
 * Refresh the live session and publish durable mode/proposal events after a transaction commits. Notification failures are logged without undoing acceptance.
 * @param opts.agentId Session whose committed state changed.
 * @param opts.proposal Publish a proposal event in addition to mode state.
 * @param opts.wake Wake the worker after scheduling an approved or command task.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Session whose committed state changed. */
        agentId: string;
        /** Publish a proposal event in addition to mode state. */
        proposal?: boolean;
        /** Wake the worker after scheduling an approved or command task. */
        wake?: boolean;
        /** Command operation linking this invalidation to its visible result; omitted for proposal-only updates. */
        operationId?: string;
        /** Client request key of the command that changed mode. */
        requestId?: string;
    },
): Promise<void> {
    try {
    const state=await ctx.fns.planning.read({agentId:opts.agentId});
    await ctx.fns.session.appendEvent({id:opts.agentId,event:{type:'planning_mode',text:state.mode==='plan'?'Planning mode enabled (advisory, not a sandbox)':'Planning mode disabled',mode:state.mode,revision:state.revision,...(opts.operationId?{operationId:opts.operationId,requestId:opts.requestId}: {})}});
    if(opts.proposal && state.proposal) await ctx.fns.session.appendEvent({id:opts.agentId,event:{type:'planning_proposal',text:state.proposal.status==='pending'?'Plan ready for review':state.proposal.status==='approved'?'Plan approved':'Keep planning',proposalId:state.proposal.id,inputId:state.proposal.inputId,status:state.proposal.status,revision:state.revision}});
    const live=ctx.state.agent?.[opts.agentId]; if(live) await ctx.fns.session.syncAgentState({agent:live});
    ctx.fns.procs.events.refresh({topic:'agent:'+opts.agentId,reason:'planning'});
    } catch(error) {console.error('Committed planning notification failed',opts.agentId,error);}
    if(opts.wake) ctx.fns.agent.wakeWorker({});
}
