/**
 * Persist a goal mutation inside an existing owner transaction
 *
 * Internal transaction-only single writer for external orchestration and persist. Locks the owner, checks identity/revision and model ownership, and writes goal and audit atomically. Does not schedule or grant external authorization.
 * @param opts.agentId Exact goal owner.
 * @param opts.command Validated model or external mutation command.
 * @param opts.expectedGoalId Observed identity; null asserts absence.
 * @param opts.expectedRevision Observed revision; null asserts absence.
 * @param opts.runToken Captured live worker claim required for model commands.
 * @param opts.maxTokenBudget Host model creation cap; null means unlimited.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact goal owner. */
        agentId: string;
        /** Validated model or external mutation command. */
        command: types.goal.Command;
        /** Observed identity; null asserts absence. */
        expectedGoalId: string | null;
        /** Observed revision; null asserts absence. */
        expectedRevision: number | null;
        /** Captured live worker claim required for model commands. */
        runToken?: string;
        /** Host model creation cap; null means unlimited. */
        maxTokenBudget?: number | null;
    },
): Promise<types.goal.State | null> {
    if (!await ctx.fns.goal.enabled({})) throw new Error('Goal feature disabled');
    if (!ctx.state.procs?.db?.transactionStorage?.getStore()?.active) throw new Error('Goal mutation requires active transaction');
            const owners = await ctx.fns.procs.db.select({sql:'SELECT id, run_token, run_state, archived_at FROM agents WHERE id = ? FOR UPDATE',params:[opts.agentId]}) as Array<{id:string;run_token:string|null;run_state:string;archived_at:number|null}>;
            const owner = owners[0];
            if (!owner) throw new Error('Goal owner not found');
            const model = opts.command.kind === 'create' || opts.command.kind === 'update';
            if (model && (owner.archived_at != null || !opts.runToken || opts.runToken !== owner.run_token || owner.run_state !== 'running')) throw new Error('Goal conflict: stale or inactive run');
            const result = await ctx.fns.goal.read({agentId:opts.agentId});
            if (!result.enabled) throw new Error('Goal feature disabled');
            const current = result.goal;
            const now = Date.now();
            const next = await ctx.fns.goal.transition({current,command:opts.command,expectedGoalId:opts.expectedGoalId,expectedRevision:opts.expectedRevision,now,newGoalId:crypto.randomUUID(),agentId:opts.agentId,maxTokenBudget:opts.maxTokenBudget??null});
            if (!next && !current) return null;
            if (!next) {
                const deleted = await ctx.fns.procs.db.run({sql:'DELETE FROM agent_goals WHERE agent_id = ? AND goal_id = ?::uuid AND revision = ?',params:[opts.agentId,current!.goalId,current!.revision]}) as {changes:number};
                if (deleted.changes !== 1) throw new Error('Goal conflict during clear');
            } else {
                await ctx.fns.procs.db.run({sql:'INSERT INTO agent_goals(agent_id,goal_id,schema_version,revision,objective,status,token_budget,tokens_used,time_used_seconds,created_at,updated_at) VALUES (?,?::uuid,?,?,?,?,?,?,?,?,?) ON CONFLICT(agent_id) DO UPDATE SET goal_id=EXCLUDED.goal_id,schema_version=EXCLUDED.schema_version,revision=EXCLUDED.revision,objective=EXCLUDED.objective,status=EXCLUDED.status,token_budget=EXCLUDED.token_budget,tokens_used=EXCLUDED.tokens_used,time_used_seconds=EXCLUDED.time_used_seconds,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at',params:[next.agentId,next.goalId,next.schemaVersion,next.revision,next.objective,next.status,next.tokenBudget,next.tokensUsed,next.timeUsedSeconds,next.createdAt,next.updatedAt]});
            }
            await ctx.fns.procs.db.run({sql:'INSERT INTO goal_transition_events(agent_id,goal_id,origin,before_revision,after_revision,before_status,after_status,run_token,created_at) VALUES (?,?::uuid,?,?,?,?,?,?,?)',params:[opts.agentId,(next??current)!.goalId,opts.command.kind,current?.revision??null,next?.revision??null,current?.status??null,next?.status??null,model?opts.runToken??null:null,now]});
            return next;
}
