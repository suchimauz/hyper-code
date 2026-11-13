/** Permanently remove comments only if the owner is still archived when this handler acquires its row lock. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Identifier of the agent whose first archive transition succeeded. */
    agentId: string;
}): Promise<void> {
    const keys = await ctx.fns.gitUi.cleanupArchivedAgent({ agentId: opts.agentId });
    for (const key of keys) await ctx.fns.gitUi.commentsChanged(key);
}
