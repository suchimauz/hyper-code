/**
 * Persist a goal snapshot with a durable fork barrier without scheduling.
 *
 * Call after source accounting flush. Copies unchanged identity, usage, status and timestamps into an idle unscheduled child with no goal; atomically adds a scoped fork barrier. Active snapshots never imply permission to auto-start.
 * @param opts.sourceAgentId Source owner after accounting flush.
 * @param opts.targetAgentId New idle unscheduled owner.
 * @param opts.expectedGoalId Source identity after flush.
 * @param opts.expectedRevision Source revision after flush. @minimum 1
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Source owner after accounting flush. */
        sourceAgentId: string;
        /** New idle unscheduled owner. */
        targetAgentId: string;
        /** Source identity after flush. */
        expectedGoalId: string;
        /** Source revision after flush. @minimum 1 */
        expectedRevision: number;
        /** Trusted manual-fork source lease state captured before flushing. Omit only for legacy direct callers. */
        expectedSourceRunState?: string;
        /** Trusted manual-fork source worker token, including null for an idle owner. */
        expectedSourceRunToken?: string | null;
        /** Internal transaction ownership; caller mode requires an active framework transaction. @default own */
        transactionMode?: 'own' | 'caller';
    },
): Promise<{copied:boolean;reason:string}> {
    if (opts.transactionMode === 'caller' && !(ctx.state.procs as any)?.db?.transactionStorage?.getStore()?.active) throw new Error('Snapshot caller mode requires an active framework transaction');
    if (!await ctx.fns.goal.enabled({})) return {copied:false,reason:'disabled'};
    if(opts.sourceAgentId===opts.targetAgentId) throw new Error('Fork requires distinct owners');
    const copy = async (): Promise<{copied:boolean;reason:string}> => {
    const owners=await ctx.fns.procs.db.select({sql:'SELECT id,run_state,run_token,next_run_at,archived_at FROM agents WHERE id IN (?,?) ORDER BY id FOR UPDATE',params:[opts.sourceAgentId,opts.targetAgentId]});
    const target=owners.find(row=>row.id===opts.targetAgentId);
    const owner=owners.find(row=>row.id===opts.sourceAgentId);
    if (opts.expectedSourceRunState !== undefined && (!owner || owner.run_state !== opts.expectedSourceRunState || (owner.run_token ?? null) !== opts.expectedSourceRunToken)) return {copied:false,reason:'stale_source_lease'};
    if(owners.length!==2 || !target || target.run_state!=='idle' || target.next_run_at!=null || target.archived_at!=null) return {copied:false,reason:'target_unavailable'};
    const source=(await ctx.fns.procs.db.select({sql:'SELECT goal_id,revision FROM agent_goals WHERE agent_id=? FOR UPDATE',params:[opts.sourceAgentId]}))[0];
    if(!source || source.goal_id!==opts.expectedGoalId || Number(source.revision)!==opts.expectedRevision) return {copied:false,reason:'stale_source'};
    if((await ctx.fns.procs.db.select({sql:'SELECT goal_id FROM agent_goals WHERE agent_id=?',params:[opts.targetAgentId]})).length) return {copied:false,reason:'target_has_goal'};
    await ctx.fns.procs.db.run({sql:'INSERT INTO agent_goals(agent_id,goal_id,schema_version,revision,objective,status,token_budget,tokens_used,time_used_seconds,created_at,updated_at) SELECT ?,goal_id,schema_version,revision,objective,status,token_budget,tokens_used,time_used_seconds,created_at,updated_at FROM agent_goals WHERE agent_id=?',params:[opts.targetAgentId,opts.sourceAgentId]});
    await ctx.fns.procs.db.run({sql:"INSERT INTO goal_continuation_deferrals(agent_id,goal_id,reason,created_at) VALUES(?,?,'fork_snapshot',?)",params:[opts.targetAgentId,opts.expectedGoalId,Date.now()]});
    return {copied:true,reason:'deferred'};
    };
    return opts.transactionMode === 'caller' ? await copy() : await ctx.fns.procs.db.transaction({fn:copy}) as {copied:boolean;reason:string};
}
