/** Stops the hourly model list refresh. */
export default async function (_ctx: Context, _session: Session | null, state?: { refreshTimer?: ReturnType<typeof setInterval> }) {
    if (state?.refreshTimer) clearInterval(state.refreshTimer);
}
