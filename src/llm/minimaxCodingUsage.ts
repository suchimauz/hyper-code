/**
 * Fetch measured five-hour and weekly MiniMax M Plan quota windows
 *
 * Use for subscription quota refresh with the configured M Plan Subscription Key. Calls only the MiniMax token-plan remains endpoint with a bounded deadline and no redirects. Rejects failed or unrecognized responses instead of inferring unused quota; returns normalized windows for llm.recordUsage. The endpoint reports remaining percent, which is inverted to used percent; video windows are ignored.
 * @param opts.timeoutMs Request deadline in milliseconds. @default 5000 @minimum 500 @maximum 30000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Request deadline in milliseconds. @default 5000 @minimum 500 @maximum 30000 */
        timeoutMs?: number;
    },
): Promise<{ primary?: { used_percent: number; window_minutes: number; resets_at: number }; secondary?: { used_percent: number; window_minutes: number; resets_at: number }; planType: string | null }> {
    const key = await ctx.fns.secrets.resolveSetting({ module: "llm", scopeType: "global", key: "minimaxCodingApiKey" });
    if (!key) throw new Error("MiniMax M Plan key is not configured");
    const timeout = Math.min(30000, Math.max(500, opts.timeoutMs ?? 5000));
    const res = await ctx.fns.llm.connectFetch({ url: "https://www.minimax.io/v1/token_plan/remains", init: { headers: { authorization: "Bearer " + key, accept: "application/json" }, signal: AbortSignal.timeout(timeout), redirect: "error" } });
    if (!res.ok) throw new Error("MiniMax quota HTTP " + res.status);
    const body = await res.json() as { base_resp?: { status_code?: number; status_msg?: string }; model_remains?: Array<{ model_name?: string; end_time?: number; weekly_end_time?: number; current_interval_remaining_percent?: number; current_weekly_remaining_percent?: number }> };
    if (body.base_resp?.status_code !== 0 || !Array.isArray(body.model_remains)) throw new Error("Unrecognized MiniMax quota response: " + (body.base_resp?.status_msg ?? "no model_remains"));
    // The M Plan groups text-model usage under "general"; video and other
    // modalities bill separately and must not color the coding rings.
    const entry = body.model_remains.find(remain => remain.model_name === "general") ?? body.model_remains[0];
    if (!entry) throw new Error("No MiniMax quota windows");
    const result: { primary?: { used_percent: number; window_minutes: number; resets_at: number }; secondary?: { used_percent: number; window_minutes: number; resets_at: number }; planType: string | null } = { planType: "M Plan" };
    const window = (remaining: unknown, resetsMs: unknown, windowMinutes: number) => {
        const remainingPercent = Number(remaining);
        const resets = Number(resetsMs);
        if (!Number.isFinite(remainingPercent) || remainingPercent < 0 || remainingPercent > 100 || !Number.isFinite(resets) || resets <= 0) return null;
        return { used_percent: Math.min(100, Math.max(0, 100 - remainingPercent)), window_minutes: windowMinutes, resets_at: resets / 1000 };
    };
    const primary = window(entry.current_interval_remaining_percent, entry.end_time, 300);
    const secondary = window(entry.current_weekly_remaining_percent, entry.weekly_end_time, 10080);
    if (primary) result.primary = primary;
    if (secondary) result.secondary = secondary;
    if (!result.primary && !result.secondary) throw new Error("No recognized MiniMax quota windows");
    return result;
}
