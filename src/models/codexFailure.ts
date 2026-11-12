/**
 * Classify a Codex backend error into SDK failure metadata
 *
 * Pure Codex classifier for HTTP error responses (phase http) and failed stream events (phase stream). Distinguishes 401 login, exhausted quota (usage_limit_reached, usage_not_included, quota_exceeded, credits_depleted codes) from transient throttling (other 429 or rate_limit codes), invalid input (4xx), and provider failures (5xx). Keeps retry timing from resets_at/resets_in_seconds or Retry-After. HTTP errors were not accepted and are replay-safe; stream failures happened after acceptance and are not. Returns a safe message without the upstream body.
 * @param opts.phase Whether the error came as an HTTP status before streaming or as a stream event.
 * @param opts.status HTTP status of the response.
 * @param opts.error Parsed upstream error object, when any (code, type, message, resets_at, resets_in_seconds).
 * @param opts.retryAfter Retry-After header value, when any.
 * @param opts.now Clock in epoch milliseconds, for retry timing. @default Date.now()
 */
export default function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Whether the error came as an HTTP status before streaming or as a stream event. */
        phase: "http" | "stream";
        /** HTTP status of the response. */
        status: number;
        /** Parsed upstream error object, when any (code, type, message, resets_at, resets_in_seconds). */
        error?: Record<string, unknown> | null;
        /** Retry-After header value, when any. */
        retryAfter?: string | null;
        /** Clock in epoch milliseconds, for retry timing. @default Date.now() */
        now?: number;
    },
): { info: types.models.FailureInfo; message: string; status: number } {
    const now = opts.now ?? Date.now();
    const e = opts.error ?? {};
    const code = `${String(e.code ?? "")} ${String(e.type ?? "")}`;
    const accepted = opts.phase === "stream";
    const base = { upstreamStatus: opts.status, acceptance: accepted ? "accepted" as const : "rejected" as const, replaySafe: !accepted };
    let retryAfterMs: number | undefined;
    const at = Number(e.resets_at), inSecs = Number(e.resets_in_seconds);
    if (Number.isFinite(at) && at > 0) retryAfterMs = Math.max(0, at * 1000 - now);
    else if (Number.isFinite(inSecs) && inSecs >= 0) retryAfterMs = inSecs * 1000;
    else if (opts.retryAfter) {
        const secs = Number(opts.retryAfter), date = Date.parse(opts.retryAfter);
        if (Number.isFinite(secs) && secs >= 0) retryAfterMs = secs * 1000;
        else if (Number.isFinite(date)) retryAfterMs = Math.max(0, date - now);
    }
    const timing = retryAfterMs !== undefined ? { retryAfterMs } : {};
    if (opts.status === 401) return { status: 409, message: "Codex login required: the backend rejected the access token", info: { code: "LOGIN_REQUIRED", classification: "auth", retryable: false, ...base } };
    if (/usage_limit_reached|usage_not_included|quota_exceeded|credits_depleted/i.test(code))
        return { status: 429, message: "Codex usage limit reached", info: { code: "QUOTA_EXHAUSTED", classification: "quota", retryable: false, ...timing, ...base } };
    if (opts.status === 429 || /rate_limit/i.test(code))
        return { status: 429, message: "Codex is rate limiting requests", info: { code: "RATE_LIMITED", classification: "throttled", retryable: true, ...timing, ...base } };
    if (opts.status === 408 || opts.status >= 500 || /server_error|overloaded/i.test(code))
        return { status: 502, message: `Codex backend error${opts.status ? ` (HTTP ${opts.status})` : ""}`, info: { code: "PROVIDER_ERROR", classification: "provider", retryable: true, ...timing, ...base } };
    if (opts.status >= 400 && opts.status < 500 || /invalid|context_length/i.test(code))
        return { status: 400, message: `Codex rejected the request${opts.status ? ` (HTTP ${opts.status})` : ""}${/^[a-z_]{1,60}$/.test(String(e.code ?? "")) ? `: ${e.code}` : ""}`, info: { code: "INVALID_INPUT", classification: "invalid_input", retryable: false, ...base } };
    return { status: 502, message: `Codex request failed${/^[a-z_]{1,60}$/.test(String(e.code ?? "")) ? `: ${e.code}` : ""}`, info: { code: "PROVIDER_ERROR", classification: "provider", retryable: false, ...timing, ...base } };
}
