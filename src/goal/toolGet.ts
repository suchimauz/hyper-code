/**
 * Read the current root-owned goal from a trusted native invocation
 *
 * Native get_goal adapter with no model arguments. Reject missing run authority and descendant or sidecar access. Reading never refreshes mutation authority.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<{ enabled: false } | { enabled: true; goal: types.goal.State | null }> {
    if (Object.keys(opts).length) throw new Error('get_goal accepts no arguments');
    if (!await ctx.fns.goal.enabled({})) return {enabled:false};
    const b = await ctx.fns.goal.toolScope({action:'read'}) as Readonly<{ sourceAgentId: string; ownerAgentId: string; runToken: string; role: "root" | "descendant" | "sidecar"; expectedGoalId: string | null; expectedRevision: number | null; maxTokenBudget: number | null }> | undefined;
    if (!b || b.role !== 'root' || b.sourceAgentId !== b.ownerAgentId) throw new Error('Goal tool requires root invocation authority');
    return await ctx.fns.goal.read({agentId:b.ownerAgentId});
}
