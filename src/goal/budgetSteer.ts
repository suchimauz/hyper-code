/**
 * Append budget-limit steering atomically once per agent and goal identity
 *
 * Internal post-commit hook for trusted run bindings. Disabled performs no SQL. Locks owner and verifies active token, immutable identity and budget_limited. Message and durable receipt share a transaction; external budget edits never rearm the receipt. No scheduling, cancellation or forced continuation. Call outside transactions before token revocation and never after terminal output. Append failures including allocator collisions roll back and propagate with cause, without unsafe retries on generic aborted-transaction errors.
 * @param opts.agentId Owner agent identifier scoping the receipt.
 * @param opts.goalIdentity Immutable goal UUID captured at activation.
 * @param opts.runToken Trusted activation token, never accepted from model arguments.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Owner agent identifier scoping the receipt. */
        agentId: string;
        /** Immutable goal UUID captured at activation. */
        goalIdentity: string;
        /** Trusted activation token, never accepted from model arguments. */
        runToken: string;
    },
): Promise<{steered:boolean;reason:string}> {
    if (!await ctx.fns.goal.enabled({})) return {steered:false,reason:'disabled'};
    if (!opts.agentId || !opts.goalIdentity || !opts.runToken) return {steered:false,reason:'invalid-binding'};
    return await ctx.fns.procs.db.transaction({fn:async()=>{
     const owners=await ctx.fns.procs.db.select({sql:'SELECT id, run_token, run_state, archived_at FROM agents WHERE id = ? FOR UPDATE',params:[opts.agentId]}) as Array<{run_token:string|null;run_state:string;archived_at:number|null}>;
     const owner=owners[0];
     if (!owner || owner.archived_at != null || owner.run_state !== 'running' || owner.run_token !== opts.runToken) return {steered:false,reason:'stale-run'};
     const read=await ctx.fns.goal.read({agentId:opts.agentId});
     const goal=read.enabled ? read.goal : null;
     if (!goal || goal.goalId !== opts.goalIdentity) return {steered:false,reason:'stale-goal'};
     if (goal.status !== 'budget_limited') return {steered:false,reason:'not-budget-limited'};
     const receipts=await ctx.fns.procs.db.select({sql:'SELECT agent_id FROM goal_budget_steering_receipts WHERE agent_id=? AND goal_id=?::uuid',params:[opts.agentId,opts.goalIdentity]});
     if (receipts.length) return {steered:false,reason:'already-steered'};
     const content=await ctx.fns.goal.budgetSteerRender({objective:goal.objective,timeUsedSeconds:goal.timeUsedSeconds,tokensUsed:goal.tokensUsed,tokenBudget:goal.tokenBudget});
     const now=Date.now();
     await ctx.fns.procs.db.run({sql:'INSERT INTO goal_budget_steering_receipts(agent_id,goal_id,created_at) VALUES (?,?::uuid,?)',params:[opts.agentId,opts.goalIdentity,now]});
     try { await ctx.fns.session.appendMessage({id:opts.agentId,ts:now,message:{role:'user',content,message_type:'goal_budget_limit',excluded_from_cursor:true}}); }
     catch(cause) {
     // appendMessage retries idx collisions in an already-aborted PG transaction.
     // Generic 25P02 cannot prove uniqueness: rollback/report, never blind retry.
     throw new Error('Budget steering append failed; atomic receipt/message rollback required (including allocation conflicts)',{cause});
     }
     return {steered:true,reason:'steered'};
    }}) as {steered:boolean;reason:string};
}
