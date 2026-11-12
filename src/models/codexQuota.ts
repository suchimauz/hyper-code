/**
 * Extract Codex quota windows from a response
 *
 * Reads quota observations Codex already reports on inference responses — x-codex-{primary,secondary}-{used-percent,window-minutes,reset-at} headers and a stream rate_limits payload (which wins) — without any extra usage request or legacy recording. Returns null when nothing usable is present.
 * @param opts.headers Response headers.
 * @param opts.rateLimits rate_limits object from the stream, when any.
 */
export default function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Response headers. */
        headers?: Headers;
        /** rate_limits object from the stream, when any. */
        rateLimits?: Record<string, unknown> | null;
    },
): types.models.QuotaObservation | null {
    const num = (v: unknown) => v === null || v === undefined || v === "" ? NaN : Number(v);
    const window = (name: string, used: number, minutes: number, resetSec: number) => ({
        name, usedPercent: Math.max(0, Math.min(100, used)),
        ...(Number.isFinite(minutes) && minutes > 0 ? { windowMinutes: minutes } : {}),
        ...(Number.isFinite(resetSec) && resetSec > 0 ? { resetAt: resetSec * 1000 } : {}),
    });
    const names = ["primary", "secondary", "tertiary"];
    if (opts.rateLimits && typeof opts.rateLimits === "object") {
        const windows = names.flatMap(name => {
            const w = opts.rateLimits![name] as Record<string, unknown> | undefined;
            const used = num(w?.used_percent);
            return w && Number.isFinite(used) ? [window(name, used, num(w.window_minutes), num(w.resets_at ?? w.reset_at))] : [];
        });
        if (windows.length) return { windows, source: "stream" };
    }
    const h = opts.headers;
    if (!h) return null;
    const windows = names.flatMap(name => {
        const used = num(h.get(`x-codex-${name}-used-percent`));
        return Number.isFinite(used) ? [window(name, used, num(h.get(`x-codex-${name}-window-minutes`)), num(h.get(`x-codex-${name}-reset-at`)))] : [];
    });
    return windows.length ? { windows, source: "headers" } : null;
}
