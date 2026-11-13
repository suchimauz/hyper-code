/** Release the hourly archive cleanup timer when the Git plugin stops. */
export default async function (ctx: Context, _session: Session | null, _state: {} = {}): Promise<void> {
    if (ctx.state.gitUi?.archivedSweepTimer) {
        clearInterval(ctx.state.gitUi.archivedSweepTimer);
        delete ctx.state.gitUi.archivedSweepTimer;
    }
}
