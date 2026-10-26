/**
 * Starts one browser idle cleanup timer per runtime process.
 *
 * Called on browser session access to enable ten-minute cleanup even when no further agent calls arrive. Checks every thirty seconds through the current hot-reloaded sweep function; the timer does not keep the process alive.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<{ started: boolean }> {
    type State = { sessions?: Map<string, object>; idleTimer?: ReturnType<typeof setInterval> };
    const state: State = ((ctx.state as { cdp?: State }).cdp ??= { sessions: new Map() });
    if (state.idleTimer) return { started: false };
    state.idleTimer = setInterval(() => {
        void ctx.fns.cdp.sweepIdle({}).catch(error => console.warn('Browser idle sweep failed', error));
    }, 30_000);
    state.idleTimer.unref();
    return { started: true };
}
