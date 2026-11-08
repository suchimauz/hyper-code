/**
 * Apply an isolated goal externalSet mutation with optimistic concurrency.
 *
 * Internal storage API, not a registered model tool. Requires feature enablement and caller-supplied observed identity/revision; no scheduling or legacy writes.
 * @param opts.agentId Goal owner identifier.
 * @param opts.expectedGoalId Observed goal identity; null asserts absence.
 * @param opts.expectedRevision Observed revision; null asserts absence.
 * @param opts.objective Replacement objective; omission preserves existing.
 * @param opts.status Requested state; omission preserves existing.
 * @param opts.tokenBudget New cap; omission preserves, null removes.
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
        /** Replacement objective; omission preserves existing. */
        objective?: string;
        /** Requested state; omission preserves existing. */
        status?: types.goal.State["status"];
        /** New cap; omission preserves, null removes. */
        tokenBudget?: number | null;
    },
): Promise<types.goal.State | null> {
    return await ctx.fns.goal.persist({agentId:opts.agentId,expectedGoalId:opts.expectedGoalId,expectedRevision:opts.expectedRevision,command:{kind:'set',objective:opts.objective,status:opts.status,tokenBudget:opts.tokenBudget}});
}
