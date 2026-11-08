/**
 * Arrange recorded quota windows by their reported duration without assuming provider slots
 *
 * Use when presenting stored subscription snapshots. Five-hour, weekly and monthly durations prefer primary, secondary and tertiary respectively. Unknown durations and additional windows retain their data in remaining slots; no duration is inferred. Expired windows are omitted before placement.
 * @param opts.windows Recorded provider windows; slot names do not identify duration.
 * @param opts.now Current epoch milliseconds used to exclude expired quota windows.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Recorded provider windows; slot names do not identify duration. */
        windows: types.llm.UsageSnapshot["windows"];
        /** Current epoch milliseconds used to exclude expired quota windows. */
        now: number;
    },
): types.llm.UsageSnapshot["windows"] {
    const slots = ["primary", "secondary", "tertiary"] as const;
    const result: types.llm.UsageSnapshot["windows"] = {};
    const pending: Array<{ slot: typeof slots[number]; window: types.llm.UsageWindow }> = [];
    for (const slot of slots) {
        const window = opts.windows?.[slot];
        if (!window || (window.resetsAt != null && window.resetsAt <= opts.now)) continue;
        const target = window.windowMinutes === 300 ? "primary" : window.windowMinutes === 10080 ? "secondary" : window.windowMinutes === 43200 ? "tertiary" : null;
        if (target && !result[target]) result[target] = window;
        else pending.push({ slot, window });
    }
    for (const { slot, window } of pending) {
        const target = !result[slot] ? slot : slots.find(key => !result[key]);
        if (target) result[target] = window;
    }
    return result;
}
