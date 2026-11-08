import { describe, test, expect } from "bun:test";
import decision from "./retryDecision";
import classify from "./classifyError";

const failure = (code = "SERVER", extra = {}) => ({ code, provider: "test", account: "default", kind: "transient", message: "failed", retryable: true, ...extra });
const run = (policy: object = {}, retry = 0, info = failure()) => decision({ fns: { settings: { get: async () => policy } } } as any, null, { failure: info as any, retry });

describe("llm.retryDecision", () => {
    test("defaults bound five retries and exponential delay", async () => {
        for (let i = 0; i < 5; i++) {
            const d = await run({}, i);
            expect(d.retry).toBe(true);
            expect(d.delayMs).toBeGreaterThanOrEqual(1000 * 2 ** i * .8);
            expect(d.delayMs).toBeLessThanOrEqual(1000 * 2 ** i * 1.2);
        }
        expect((await run({}, 5)).retry).toBe(false);
    });
    test("always ignores only count, permanent codes cannot be enabled", async () => {
        expect((await run({ mode: "always" }, 1000)).retry).toBe(true);
        for (const code of ["AUTH", "QUOTA", "USAGE_LIMIT", "OVERFLOW", "SSH_PERMANENT", "FATAL"]) {
            expect((await run({ mode: "always", retryableCodes: [code] }, 0, failure(code))).retry).toBe(false);
        }
    });
    test("honors Retry-After floor or refuses excessive normal waits", async () => {
        expect((await run({}, 0, failure("RATE_LIMIT", { retryAfterMs: 60001 }))).retry).toBe(false);
        expect((await run({ mode: "always" }, 99, failure("RATE_LIMIT", { retryAfterMs: 98765 }))).delayMs).toBe(98765);
        expect((await run({ jitterRatio: 0 }, 0, failure("RATE_LIMIT", { retryAfterMs: 0 }))).delayMs).toBe(1000);
        expect((await run({ jitterRatio: 0 }, 2, failure("RATE_LIMIT", { retryAfterMs: 2500 }))).delayMs).toBe(4000);
    });
    test("provider overrides and configurable code subsets", async () => {
        expect((await run({ providers: { test: { maxRetries: 0 } } })).retry).toBe(false);
        expect((await run({ retryableCodes: ["TIMEOUT"] })).retry).toBe(false);
        expect((await run({ initialDelayMs: 20, maxDelayMs: 30, jitterRatio: 0 }, 3)).delayMs).toBe(30);
        expect((await run({}, 0, failure("SERVER", { retryable: false }))).retry).toBe(false);
    });
    test("stable classification codes", () => {
        for (const [status, body, code] of [[429, "", "RATE_LIMIT"], [503, "", "SERVER"], [408, "", "TIMEOUT"], [0, "fetch failed", "TRANSPORT"], [0, "empty response", "EMPTY_RESPONSE"], [401, "", "AUTH"], [413, "", "OVERFLOW"], [429, "insufficient_quota", "QUOTA"]] as const) {
            expect(classify({} as any, null, { provider: "test", status, body }).code).toBe(code);
        }
    });
});
