import { test, expect } from "bun:test";
import request from "./request";
import policy from "./policy";

const ctx: any = { fns: { sshProvider: { policy: (o: any) => policy(ctx, null, o) } } };
const base = { provider: "codex", url: "https://chatgpt.com/backend-api/codex/models", proxyPort: 1 };

test("deadlines outside the supported ranges are refused before networking", async () => {
    for (const [extra, message] of [
        [{ timeoutMs: 3600001 }, "deadline range"],
        [{ timeoutMs: 0 }, "deadline range"],
        [{ idleTimeoutMs: 0 }, "idle deadline range"],
        [{ idleTimeoutMs: 600001 }, "idle deadline range"],
        [{ idleTimeoutMs: Number.NaN }, "idle deadline range"],
    ] as const) {
        let done = 0;
        await expect(request(ctx, null, { ...base, ...extra, onDone: () => done++ })).rejects.toThrow(message);
        expect(done).toBe(1);
    }
});

test("a total deadline above the old two-minute cap is accepted", async () => {
    // Port 1 refuses the SOCKS connection: validation passed, the failure is transport.
    await expect(request(ctx, null, { ...base, timeoutMs: 1800000, idleTimeoutMs: 90000 })).rejects.toThrow(/SOCKS|ECONNREFUSED|connect/);
});
