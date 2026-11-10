/**
 * Resolve an exact planning proposal from a CSRF-verified human HTTP decision
 *
 * Use only from planning review routes or the native review card route. Approve switches to execute and delivers the exact plan; keep delivers the decision while remaining in plan. Both resume through the common input lifecycle only after remaining waits clear, respecting Stop, archive and paused task plans. Ordinary replies and generic input.submit cannot approve.
 * @param opts.req Current authenticated browser request carrying the session cookie and CSRF header.
 * @param opts.agentId Session that owns the proposal.
 * @param opts.proposalId Immutable proposal identifier being reviewed.
 * @param opts.decision Explicit choice from the human review control.
 * @param opts.expectedRevision Planning revision displayed with this exact proposal.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Current authenticated browser request carrying the session cookie and CSRF header. */
        req: Request;
        /** Session that owns the proposal. */
        agentId: string;
        /** Immutable proposal identifier being reviewed. */
        proposalId: string;
        /** Explicit choice from the human review control. */
        decision: 'approve' | 'keep';
        /** Planning revision displayed with this exact proposal. */
        expectedRevision: number;
    },
): Promise<Record<string, unknown>> {
    if(session?.req!==opts.req) throw Object.assign(new Error('Review requires the current human HTTP request'),{status:403,code:'human_review_required'});
    const actor=await ctx.fns.projects.principal({});
    if(!await ctx.fns.auth.verifyCsrf({req:opts.req,token:opts.req.headers.get('x-csrf-token')??''})) throw Object.assign(new Error('Invalid CSRF token'),{status:403,code:'invalid_csrf'});
    if(!['approve','keep'].includes(opts.decision)||!Number.isInteger(opts.expectedRevision)) throw Object.assign(new Error('Invalid review decision'),{status:400});
    const result=await ctx.fns.procs.db.transaction({fn:async()=>{
    await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? FOR UPDATE',params:[opts.agentId]});
    const state=await ctx.fns.planning.read({agentId:opts.agentId}); const proposal=state.proposal;
    const target=opts.decision==='approve'?'approved':'kept';
    if(!proposal||proposal.id!==opts.proposalId) throw Object.assign(new Error('This proposal is no longer current'),{status:409,code:'stale_proposal'});
    if(proposal.status===target) return {ok:true,duplicate:true,scheduled:false,planning:state};
    if(proposal.status!=='pending'||state.mode!=='plan'||state.revision!==opts.expectedRevision) throw Object.assign(new Error('Planning changed; refresh the exact proposal before reviewing'),{status:409,code:'stale_proposal'});
    await ctx.fns.planning.assertIdle({agentId:opts.agentId});
    const now=Date.now(); proposal.status=target;
    await ctx.fns.procs.db.run({sql:'UPDATE agent_planning SET mode=?,revision=revision+1,proposal=?::jsonb,updated_at=? WHERE agent_id=?',params:[opts.decision==='approve'?'execute':'plan',JSON.stringify(proposal),now,opts.agentId]});
    const authority=ctx.state.input?.kinds?.['planning-review']?.completionAuthority;
    if(!authority) throw new Error('Planning review lifecycle authority is unavailable');
    const summary=opts.decision==='approve'
        ? 'Implement the explicitly approved plan below. This approves this plan, not unrelated destructive or outward actions; existing specific confirmation requirements remain.\n\n'+proposal.plan
        : 'Keep planning. The proposed plan was not approved; continue research or clarification, not implementation.';
    const completion=await ctx.fns.input.complete({id:proposal.inputId,state:'submitted',summary,result:{decision:opts.decision,proposalId:proposal.id,plan:proposal.plan},actor,authority});
    if(!completion.completed) throw Object.assign(new Error('This review is no longer open'),{status:409,code:'stale_proposal'});
    return {ok:true,scheduled:completion.scheduled,planning:await ctx.fns.planning.read({agentId:opts.agentId})};
    }}) as Record<string,unknown>;
    if(!result.duplicate) await ctx.fns.planning.publish({agentId:opts.agentId,proposal:true,wake:result.scheduled===true});
    return result;
}
