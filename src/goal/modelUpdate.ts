/**
 * Apply an isolated goal modelUpdate mutation with optimistic concurrency.
 *
 * Internal storage API, not a registered model tool. Requires feature enablement and caller-supplied observed identity/revision; no scheduling or legacy writes.
 * @param opts.agentId Goal owner identifier.
 * @param opts.expectedGoalId Observed goal identity; null asserts absence.
 * @param opts.expectedRevision Observed revision; null asserts absence.
 * @param opts.status Model requested terminal or stopped state.
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
        /** Model requested terminal or stopped state. */
        status: "complete" | "blocked" | "paused";
        /** Trusted current run token injected by integration. */
        runToken: string;
    },
): Promise<types.goal.State | null> {
    return await ctx.fns.goal.persist({agentId:opts.agentId,expectedGoalId:opts.expectedGoalId,expectedRevision:opts.expectedRevision,command:{kind:'update',status:opts.status},runToken:opts.runToken});
}
