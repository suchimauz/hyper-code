/** Credential-safe SDK failure metadata carried on errors thrown by models.stream/compact and opted-in providers. */
export type FailureInfo = {
    /** Stable error code, e.g. LOGIN_REQUIRED, QUOTA_EXHAUSTED, RATE_LIMITED, INVALID_INPUT, UNSUPPORTED, CAPABILITY_UNAVAILABLE, PROVIDER_ERROR, CANCELLED, TRANSPORT. */
    code: string;
    classification: "auth" | "quota" | "throttled" | "invalid_input" | "unsupported" | "capability_unavailable" | "provider" | "cancelled" | "transport";
    /** Upstream HTTP status, when one was received. */
    upstreamStatus?: number;
    /** Suggested wait before a caller-level retry, in milliseconds. */
    retryAfterMs?: number;
    /** Whether the provider may have accepted (and billed/executed) the request. */
    acceptance: "none" | "rejected" | "accepted" | "uncertain";
    /** Transient condition: a later attempt may succeed. Independent of replaySafe. */
    retryable: boolean;
    /** True only when automatically repeating the same request cannot duplicate provider-side work. */
    replaySafe: boolean;
};
