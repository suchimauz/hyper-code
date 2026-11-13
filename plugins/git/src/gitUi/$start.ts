/** Recover missed archive cleanup on startup and register exactly one hourly sweep across reloads. */
export default async function (ctx: Context, _session: Session | null, _opts: {} = {}): Promise<void> {
    const state = (ctx.state.gitUi ??= {});
    if (state.archivedSweepTimer) return;
    const sweep = async () => {
        try { await ctx.fns.gitUi.sweepArchived({}); }
        catch (error) {
            ctx.fns.procs.log.warn({ event: 'gitUi.sweepArchived.failed', msg: String(error instanceof Error ? error.message : error) });
        }
    };
    state.archivedSweepTimer = setInterval(sweep, 60 * 60 * 1000);
    state.archivedSweepTimer.unref();
    await sweep();
}
