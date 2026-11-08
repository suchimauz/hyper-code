/**
 * Admit a durable goal continuation during successful worker finalization.
 *
 * Transaction-only helper called before worker clears its live token. Caller must require successful non-aborted completion and freeze consumedIdx; existing finalize SQL then schedules the inserted cursor-visible message. Inputs writers must serialize on the owner lock. Never clears stop or fork barriers.
 * @param opts.agentId Exact goal owner.
 * @param opts.expectedGoalId Identity captured before run.
 * @param opts.expectedRevision Fresh post-accounting revision of captured goal. @minimum 1
 * @param opts.runToken Still-live token before finalize.
 * @param opts.consumedIdx Frozen consumed user cursor. @minimum -1
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact goal owner. */
        agentId: string;
        /** Identity captured before run. */
        expectedGoalId: string;
        /** Fresh post-accounting revision of captured goal. @minimum 1 */
        expectedRevision: number;
        /** Still-live token before finalize. */
        runToken: string;
        /** Frozen consumed user cursor. @minimum -1 */
        consumedIdx: number;
    },
): Promise<{admitted:boolean;reason:string;messageIdx?:number}> {
    if (!await ctx.fns.goal.enabled({})) return {admitted:false,reason:'disabled'};
    if (!ctx.state.procs?.db?.transactionStorage?.getStore()?.active) throw new Error('Admission requires active finalize transaction');
    if (!Number.isSafeInteger(opts.consumedIdx) || opts.consumedIdx < -1 || !Number.isSafeInteger(opts.expectedRevision) || opts.expectedRevision < 1 || !opts.runToken) throw new Error('Invalid admission binding');
    const owner=(await ctx.fns.procs.db.select({sql:'SELECT run_token,run_state,stopped_at,archived_at FROM agents WHERE id=? FOR UPDATE',params:[opts.agentId]}))[0];
    if (!owner || owner.run_token!==opts.runToken || owner.run_state!=='running' || owner.stopped_at!=null || owner.archived_at!=null) return {admitted:false,reason:'fenced'};
    const goal=(await ctx.fns.procs.db.select({sql:'SELECT goal_id,revision,status,token_budget,tokens_used FROM agent_goals WHERE agent_id=? FOR UPDATE',params:[opts.agentId]}))[0];
    if (!goal || goal.goal_id!==opts.expectedGoalId || Number(goal.revision)!==opts.expectedRevision) return {admitted:false,reason:'stale_goal'};
    if (goal.status!=='active' || (goal.token_budget!=null && Number(goal.tokens_used)>=Number(goal.token_budget))) return {admitted:false,reason:'inactive'};
    const prior=(await ctx.fns.procs.db.select({sql:'SELECT message_idx FROM goal_continuation_admissions WHERE agent_id=? AND goal_id=? AND run_token=?',params:[opts.agentId,opts.expectedGoalId,opts.runToken]}))[0];
    if (prior) return {admitted:false,reason:'duplicate',messageIdx:Number(prior.message_idx)};
    const guards=(await ctx.fns.procs.db.select({sql:`SELECT EXISTS(SELECT 1 FROM goal_continuation_deferrals WHERE agent_id=? AND goal_id=?) AS deferred, EXISTS(SELECT 1 FROM inputs WHERE agent_id=? AND state='open') AS pending_input, EXISTS(SELECT 1 FROM messages WHERE agent_id=? AND role='user' AND excluded_from_cursor=0 AND idx>?) AS pending_user`,params:[opts.agentId,opts.expectedGoalId,opts.agentId,opts.agentId,opts.consumedIdx]}))[0];
    if (!guards) throw new Error('Missing admission guards');
    if (guards.deferred || guards.pending_input || guards.pending_user) return {admitted:false,reason:guards.deferred?'deferred':guards.pending_input?'pending_input':'pending_user'};
    const capability=await ctx.fns.goal.nativeCapability({agentId:opts.agentId});
    if(!capability.available)return {admitted:false,reason:capability.reason};
    const now=Date.now();
    const message=await ctx.fns.session.appendMessage({id:opts.agentId,clientRequestId:'goal:'+opts.expectedGoalId+':'+opts.runToken,ts:now,message:{role:'user',author:null,content:'Continue working toward the active goal. Check its current state before acting; stop if it is no longer active. This internal continuation is not new human authorization.',message_type:'goal_continuation',excluded_from_cursor:false,excluded_from_llm:false}});
    if (message.idx<=opts.consumedIdx) throw new Error('Continuation must be beyond consumed cursor');
    await ctx.fns.procs.db.run({sql:'INSERT INTO goal_continuation_admissions(agent_id,goal_id,run_token,goal_revision,message_idx,created_at) VALUES(?,?,?,?,?,?)',params:[opts.agentId,opts.expectedGoalId,opts.runToken,opts.expectedRevision,message.idx,now]});
    return {admitted:true,reason:'admitted',messageIdx:message.idx};
}
