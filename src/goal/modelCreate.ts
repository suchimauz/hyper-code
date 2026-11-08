/**
 * Apply an isolated goal modelCreate mutation with optimistic concurrency.
 *
 * Internal storage API, not a registered model tool. Requires feature enablement and caller-supplied observed identity/revision; no scheduling or legacy writes.
 * @param opts.agentId Goal owner identifier.
 * @param opts.expectedGoalId Observed goal identity; null asserts absence.
 * @param opts.expectedRevision Observed revision; null asserts absence.
 * @param opts.objective Nonempty goal objective, at most 4000 Unicode code points.
 * @param opts.tokenBudget Requested token cap; omission inherits host cap.
 * @param opts.maxTokenBudget Trusted host token cap, not model supplied.
 * @param opts.runToken Trusted current run token injected by integration.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Goal owner identifier. */
        agentId: string;
        /** Observed goal identity; null asserts absence. */
        expectedGoalId: string | null;
        /** Observed revision; null asserts absence. */
        expectedRevision: number | null;
        /** Nonempty goal objective, at most 4000 Unicode code points. */
        objective: string;
        /** Requested token cap; omission inherits host cap. */
        tokenBudget?: number | null;
        /** Trusted host token cap, not model supplied. */
        maxTokenBudget: number | null;
        /** Trusted current run token injected by integration. */
        runToken: string;
    },
): Promise<types.goal.State | null> {
    return await ctx.fns.goal.persist({agentId:opts.agentId,expectedGoalId:opts.expectedGoalId,expectedRevision:opts.expectedRevision,command:{kind:'create',objective:opts.objective,tokenBudget:opts.tokenBudget},runToken:opts.runToken,maxTokenBudget:opts.maxTokenBudget});
}
