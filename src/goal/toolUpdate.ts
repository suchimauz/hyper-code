/**
 * Stop or complete a root-owned goal using captured native invocation authority
 *
 * Native Goal adapter. Uses trusted immutable owner, claim and CAS snapshot, never model-supplied authority or mutable current tokens. Requires a run-owned postcommit handoff and does not acquire an owner barrier. The run owns accounting serialization.
 * @param opts.status Complete only achieved work; pause only on explicit user request; block only after three consecutive turns with the same impediment. Never resumes a goal.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Complete only achieved work; pause only on explicit user request; block only after three consecutive turns with the same impediment. Never resumes a goal. */
        status: "complete" | "paused" | "blocked";
    },
): Promise<types.goal.State | null> {
    if (Object.keys(opts).some(k=>k !== 'status') || !['complete','paused','blocked'].includes(opts.status)) throw new Error('Invalid update_goal arguments');
    if (!await ctx.fns.goal.enabled({})) throw new Error('Goals are disabled');
    const b = await ctx.fns.goal.toolScope({action:'read'}) as (Readonly<{ sourceAgentId: string; ownerAgentId: string; runToken: string; role: "root" | "descendant" | "sidecar"; expectedGoalId: string | null; expectedRevision: number | null; maxTokenBudget: number | null }> & {onMutation?:(goal:types.goal.State|null)=>Promise<void>}) | undefined;
    if (!b || b.role !== 'root' || b.sourceAgentId !== b.ownerAgentId || typeof b.onMutation !== 'function') throw new Error('Goal mutation requires root invocation authority and postcommit handoff');
    const goal = await ctx.fns.goal.modelUpdate({agentId:b.ownerAgentId,expectedGoalId:b.expectedGoalId,expectedRevision:b.expectedRevision,runToken:b.runToken,status:opts.status});
    try { await b.onMutation(goal); } catch (cause) {
        throw new Error(`Goal mutation committed: ${JSON.stringify(goal)}. Run handoff failed; stop goal work and do not retry the mutation.`, {cause});
    }
    return goal;
}
