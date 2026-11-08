/**
 * Create a root-owned goal using captured native invocation authority
 *
 * Native Goal adapter. Uses trusted immutable owner, claim and CAS snapshot, never model-supplied authority or mutable current tokens. Requires a run-owned postcommit handoff and does not acquire an owner barrier. The run owns accounting serialization.
 * @param opts.objective Concrete explicitly requested objective, at most 4000 Unicode code points.
 * @param opts.token_budget Explicitly requested positive safe-integer token cap; omission inherits the trusted host cap. @minimum 1
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Concrete explicitly requested objective, at most 4000 Unicode code points. */
        objective: string;
        /** Explicitly requested positive safe-integer token cap; omission inherits the trusted host cap. @minimum 1 */
        token_budget?: number;
    },
): Promise<types.goal.State | null> {
    if (Object.keys(opts).some(k=>!['objective','token_budget'].includes(k)) || typeof opts.objective !== 'string' || !opts.objective.trim() || [...opts.objective.trim()].length > 4000 || (opts.token_budget !== undefined && (!Number.isSafeInteger(opts.token_budget) || opts.token_budget <= 0))) throw new Error('Invalid create_goal arguments');
    if (!await ctx.fns.goal.enabled({})) throw new Error('Goals are disabled');
    const b = await ctx.fns.goal.toolScope({action:'read'}) as (Readonly<{ sourceAgentId: string; ownerAgentId: string; runToken: string; role: "root" | "descendant" | "sidecar"; expectedGoalId: string | null; expectedRevision: number | null; maxTokenBudget: number | null }> & {onMutation?:(goal:types.goal.State|null)=>Promise<void>}) | undefined;
    if (!b || b.role !== 'root' || b.sourceAgentId !== b.ownerAgentId || typeof b.onMutation !== 'function') throw new Error('Goal mutation requires root invocation authority and postcommit handoff');
    const goal = await ctx.fns.goal.modelCreate({agentId:b.ownerAgentId,expectedGoalId:b.expectedGoalId,expectedRevision:b.expectedRevision,runToken:b.runToken,objective:opts.objective,tokenBudget:opts.token_budget,maxTokenBudget:b.maxTokenBudget});
    try { await b.onMutation(goal); } catch (cause) {
        throw new Error(`Goal mutation committed: ${JSON.stringify(goal)}. Run handoff failed; stop goal work and do not retry the mutation.`, {cause});
    }
    return goal;
}
