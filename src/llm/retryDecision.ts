/**
 * Decide whether a classified model failure should retry and compute its delay.
 *
 * Use before scheduling a model retry. Reads llm.retryPolicy global settings and provider overrides. The retry count is retries already performed. Permanent codes never retry, even in always mode; normal stops on excessive Retry-After instead of retrying early.
 * @param opts.failure Classified provider failure with stable code and optional Retry-After delay.
 * @param opts.retry Number of retries already performed; zero selects the first retry. @minimum 0
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Classified provider failure with stable code and optional Retry-After delay. */
        failure: types.llm.FailureInfo;
        /** Number of retries already performed; zero selects the first retry. @minimum 0 */
        retry: number;
    },
): Promise<{ retry: boolean; delayMs: number; mode: "normal" | "always"; maxRetries: number; provider: string }> {
    const allowed = ["RATE_LIMIT", "SERVER", "TIMEOUT", "TRANSPORT", "EMPTY_RESPONSE", "SSH_TRANSPORT"];
    const raw = await ctx.fns.settings.get({ module: "llm", key: "retryPolicy", scopeType: "global" });
    const config = raw && typeof raw === "object" ? raw as Record<string, any> : {};
    const override = config.providers?.[opts.failure.provider];
    const policy = { ...config, ...(override && typeof override === "object" ? override : {}) };
    const finite = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    const mode = policy.mode === "always" ? "always" as const : "normal" as const;
    const maxRetries = Math.floor(finite(policy.maxRetries, 5, 0, Number.MAX_SAFE_INTEGER));
    const maxDelay = finite(policy.maxDelayMs, 60000, 0, 2147483647);
    const initialDelay = finite(policy.initialDelayMs, 1000, 0, maxDelay);
    const jitter = finite(policy.jitterRatio, .2, 0, 1);
    const codes = Array.isArray(policy.retryableCodes) ? policy.retryableCodes : allowed;
    const result = { retry: false, delayMs: 0, mode, maxRetries, provider: opts.failure.provider };
    if (!Number.isInteger(opts.retry) || opts.retry < 0 || !opts.failure.retryable || !allowed.includes(opts.failure.code) || !codes.includes(opts.failure.code)) return result;
    if (mode === "normal" && opts.retry >= maxRetries) return result;
    const header = opts.failure.retryAfterMs;
    if (typeof header === "number" && Number.isFinite(header) && header >= 0) {
        if (mode === "normal" && header > maxDelay) return result;
        if (header > maxDelay) return { ...result, retry: true, delayMs: header };
    }
    const base = Math.min(maxDelay, initialDelay * 2 ** Math.min(opts.retry, 52));
    const jittered = Math.max(0, Math.round(base * (1 + (Math.random() * 2 - 1) * jitter)));
    const delayMs = Math.max(typeof header === 'number' && Number.isFinite(header) ? header : 0, jittered);
    return { ...result, retry: true, delayMs };
}
