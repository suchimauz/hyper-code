/** Close shared repository watchers and the archive cleanup timer on plugin stop. */
export default async function (ctx: Context, _session: Session | null, _state: {} = {}): Promise<void> {
    for (const entry of ctx.state.gitUi?.watchers?.values() ?? []) entry.close();
    if (ctx.state.gitUi?.archivedSweepTimer) {
        clearInterval(ctx.state.gitUi.archivedSweepTimer);
        delete ctx.state.gitUi.archivedSweepTimer;
    }
}
