/**
 * Fetch measured five-hour and weekly Z.ai Coding Plan quota windows
 *
 * Use for subscription quota refresh with the configured Coding Plan key. Calls only the Z.ai monitoring endpoint with a bounded deadline and no redirects. Rejects failed or unrecognized responses instead of inferring unused quota; returns normalized windows for llm.recordUsage. This monitoring endpoint is not in the public API reference and may change.
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
    const key = await ctx.fns.secrets.resolveSetting({ module: "llm", scopeType: "global", key: "zaiCodingApiKey" });
    if (!key) throw new Error("Z.ai Coding Plan key is not configured");
    const timeout = Math.min(30000, Math.max(500, opts.timeoutMs ?? 5000));
    // The plan can leave through a chosen SSH instance; the same key rides the bridge.
    const { instance } = ctx.fns?.llm?.codingInstance ? await ctx.fns.llm.codingInstance({ provider: "zai-coding" }) : { instance: null };
    const url = "https://api.z.ai/api/monitor/usage/quota/limit";
    // The remote bridge defaults to POST when the caller omits the method, and
    // the monitoring endpoint only answers GET. State it explicitly so quota
    // keeps working when the plan leaves through an SSH instance.
    const init = { method: "GET", headers: { authorization: "Bearer " + key, accept: "application/json" }, signal: AbortSignal.timeout(timeout), redirect: "error" as const };
    const res = instance ? await ctx.fns.sshAccount.fetch({ ssh: { instance, provider: "zai-coding", account: "default" }, url, init })
        : await ctx.fns.llm.connectFetch({ url, init });
    if (!res.ok) throw new Error("Z.ai quota HTTP " + res.status);
    const body = await res.json() as { success?: boolean; code?: number; data?: { level?: string; limits?: Array<{ type?: string; unit?: number; number?: number; percentage?: number; nextResetTime?: number }> } };
    if (body.success !== true || body.code !== 200 || !Array.isArray(body.data?.limits)) throw new Error("Unrecognized Z.ai quota response");
    const result: { primary?: { used_percent: number; window_minutes: number; resets_at: number }; secondary?: { used_percent: number; window_minutes: number; resets_at: number }; planType: string | null } = { planType: typeof body.data.level === "string" ? body.data.level : null };
    for (const limit of body.data.limits) {
        if (limit.type !== "CREDIT_LIMIT") continue;
        const slot = limit.unit === 3 && limit.number === 5 ? "primary" : limit.unit === 6 && limit.number === 1 ? "secondary" : null;
        if (!slot || typeof limit.percentage !== "number" || !Number.isFinite(limit.percentage) || limit.percentage < 0 || limit.percentage > 100 || typeof limit.nextResetTime !== "number" || !Number.isFinite(limit.nextResetTime) || limit.nextResetTime <= 0) continue;
        result[slot] = { used_percent: limit.percentage, window_minutes: slot === "primary" ? 300 : 10080, resets_at: limit.nextResetTime / 1000 };
    }
    if (!result.primary && !result.secondary) throw new Error("No recognized Z.ai quota windows");
    return result;
}
