/** Default retry limits and per-provider overrides for failed model calls. */
export default {
    type: "json",
    title: "Model retry policy",
    description: "Automatic model retries: mode normal or always, maxRetries, initialDelayMs, maxDelayMs, jitterRatio, retryableCodes. Optional providers maps provider names to overrides. Proxy failures always honor min(maxRetries,5), including Always. Always ignores only other retry counts; permanent failures never retry. Retry-After above maxDelayMs stops normal mode; always waits the full header delay.",
    default: {
        mode: "normal", maxRetries: 5, initialDelayMs: 1000, maxDelayMs: 60000, jitterRatio: 0.2,
        retryableCodes: ["RATE_LIMIT", "SERVER", "TIMEOUT", "TRANSPORT", "EMPTY_RESPONSE", "SSH_TRANSPORT", "PROXY_DNS", "PROXY_CONNECT", "PROXY_TIMEOUT", "PROXY_CONNECTION_LOST", "PROXY_DENIED"],
        providers: {},
    },
};
