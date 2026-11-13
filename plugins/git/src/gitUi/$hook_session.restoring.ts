/** Delete retained comments in the restoring transaction and invalidate repositories only after commit. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Archived owner locked by session.unarchive until cleanup and restoration commit together. */
    agentId: string;
    /** Queue awaited notifications for after successful restoration commit; never start a nested transaction here. */
    afterCommit: Array<() => Promise<void>>;
}): Promise<void> {
    const keys = await ctx.fns.gitUi.cleanupArchivedAgent({ agentId: opts.agentId, restoring: true });
    for (const key of keys) opts.afterCommit.push(async () => { await ctx.fns.gitUi.commentsChanged(key); });
}
