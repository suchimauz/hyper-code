/**
 * Atomically persist a goal mutation with identity and revision CAS.
 *
 * Internal single writer locks owner, validates model run token and writes goal plus audit in one transaction. Never touches legacy agents.goal or schedules work.
 * @param opts.agentId Goal owner identifier.
 * @param opts.command Discriminated model or external mutation.
 * @param opts.expectedGoalId Observed identity; null asserts absence.
 * @param opts.expectedRevision Observed revision; null asserts absence.
 * @param opts.runToken Live internal run token for model commands.
 * @param opts.maxTokenBudget Host creation cap; null means unlimited. @default null
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Goal owner identifier. */
        agentId: string;
        /** Discriminated model or external mutation. */
        command: types.goal.Command;
        /** Observed identity; null asserts absence. */
        expectedGoalId: string | null;
        /** Observed revision; null asserts absence. */
        expectedRevision: number | null;
        /** Live internal run token for model commands. */
        runToken?: string;
        /** Host creation cap; null means unlimited. @default null */
        maxTokenBudget?: number | null;
    },
): Promise<types.goal.State | null> {
    if (!await ctx.fns.goal.enabled({})) throw new Error('Goal feature disabled');
    return await ctx.fns.procs.db.transaction({fn: async () => await ctx.fns.goal.persistTx({...opts})}) as types.goal.State | null;
}
