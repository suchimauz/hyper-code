import { describe, expect, test } from "bun:test";
import schedule from "./retrySchedule";
import wait from "./retryWait";

// In-memory DB boundary: preserve transaction rollback and enforce row-lock ordering.
// No live agents or database records are touched by these lifecycle tests.
function fixture(attempt = 0) {
    const row = { llm_retry_attempt: attempt, llm_retry_pending: null as any, stopped_at: null as string | null, run_token: "lease" };
    const events: any[] = [];
    const decisions: number[] = [];
    let locked = false;
    let failEvent = false;
    let beforeLock: (() => void) | undefined;
    const policy = { retry: true, mode: "default", maxRetries: 5, delayMs: 0, provider: "test" };
    const ctx = { fns: {
        procs: { db: {
            transaction: async ({ fn }: any) => {
                const snapshot = structuredClone(row);
                const length = events.length;
                locked = true;
                try { return await fn(); }
                catch (error) { Object.assign(row, snapshot); events.splice(length); throw error; }
                finally { locked = false; }
            },
            select: async ({ sql, params }: any) => {
                expect(params).toEqual(["retry-test"]);
                if (sql.includes("FOR UPDATE")) {
                    expect(locked).toBe(true);
                    beforeLock?.();
                }
                return [structuredClone(row)];
            },
            run: async ({ sql, params }: any) => {
                expect(locked).toBe(true);
                if (sql.includes("llm_retry_attempt = ?")) {
                    expect(params[2]).toBe("retry-test");
                    row.llm_retry_attempt = params[0];
                    row.llm_retry_pending = JSON.parse(params[1]);
                } else if (sql.includes("llm_retry_pending = NULL")) {
                    expect(params).toEqual(["retry-test"]);
                    row.llm_retry_pending = null;
                } else throw new Error(`Unexpected write: ${sql}`);
            },
        } },
        llm: { retryDecision: async ({ retry }: any) => { decisions.push(retry); return policy; } },
        session: { appendEvent: async ({ id, event }: any) => {
            expect(locked).toBe(true);
            expect(id).toBe("retry-test");
            if (failEvent) throw new Error("event persistence failed");
            events.push(structuredClone(event));
        } },
    } } as any;
    const controller = new AbortController();
    const opts = { agentId: "retry-test", runToken: "lease", signal: controller.signal };
    const failure = { code: "SERVER", message: "upstream unavailable", status: 503, provider: "test", account: "default", kind: "transient", retryable: true } as any;
    return { row, events, decisions, policy, controller,
        schedule: () => schedule(ctx, null, { ...opts, failure }),
        wait: () => wait(ctx, null, opts),
        failEvents: () => { failEvent = true; },
        beforeLock: (fn: () => void) => { beforeLock = fn; },
    };
}

function pending(until = Date.now() - 1) {
    return { type: "llm_retry", retryId: "persisted-retry", retry: 4, until };
}

describe("agent retry lifecycle", () => {
    test("schedules from the durable attempt and persists the complete matching event", async () => {
        const f = fixture(3);
        f.policy.delayMs = 1200;
        const before = Date.now();
        expect(await f.schedule()).toBe(true);
        expect(f.decisions).toEqual([3]);
        expect(f.row.llm_retry_attempt).toBe(4);
        expect(f.row.llm_retry_pending).toEqual(f.events[0]);
        expect(f.events[0]).toMatchObject({ type: "llm_retry", retry: 4, maxRetries: 5, mode: "default", delayMs: 1200, provider: "test", failure: { code: "SERVER", message: "upstream unavailable", status: 503 } });
        expect(f.events[0].retryId).toMatch(/^[0-9a-f-]{36}$/);
        expect(f.events[0].until).toBeGreaterThanOrEqual(before + 1200);
        expect(f.events[0].until).toBeLessThanOrEqual(Date.now() + 1200);
        await f.schedule();
        expect(f.decisions).toEqual([3, 4]);
        expect(f.row.llm_retry_attempt).toBe(5);
        expect(f.events[1].retryId).not.toBe(f.events[0].retryId);
    });

    test("always mode exposes no finite maximum; refusal leaves durable state unchanged", async () => {
        const f = fixture(42);
        f.policy.mode = "always";
        await f.schedule();
        expect(f.events[0].maxRetries).toBeNull();
        const snapshot = structuredClone(f.row);
        f.policy.retry = false;
        expect(await f.schedule()).toBe(false);
        expect(f.row).toEqual(snapshot);
        expect(f.events).toHaveLength(1);
    });

    for (const reason of ["stop", "revoked lease", "abort"] as const) {
        for (const operation of ["schedule", "wait"] as const) {
            test(`${operation} fences ${reason} without writes or events`, async () => {
                const f = fixture(3);
                f.row.llm_retry_pending = pending();
                if (reason === "stop") f.row.stopped_at = "stopped";
                if (reason === "revoked lease") f.row.run_token = "replacement";
                if (reason === "abort") f.controller.abort();
                const snapshot = structuredClone(f.row);
                await expect(f[operation]()).rejects.toMatchObject({ name: "AbortError" });
                expect(f.row).toEqual(snapshot);
                expect(f.events).toEqual([]);
                expect(f.decisions).toEqual([]);
            });
        }
    }

    test("recovery honors the persisted deadline and emits one start marker without resetting attempts", async () => {
        const f = fixture(4);
        const until = Date.now() + 35;
        f.row.llm_retry_pending = pending(until);
        await f.wait();
        expect(Date.now()).toBeGreaterThanOrEqual(until);
        expect(f.events).toEqual([{ type: "llm_retry_started", retryId: "persisted-retry", retry: 4 }]);
        expect(f.row.llm_retry_pending).toBeNull();
        expect(f.row.llm_retry_attempt).toBe(4);
        await f.wait();
        expect(f.events).toHaveLength(1);
    });

    test("recovery starts an expired deadline immediately and no pending retry is a no-op", async () => {
        const f = fixture(4);
        await f.wait();
        expect(f.events).toEqual([]);
        f.row.llm_retry_pending = pending();
        await f.wait();
        expect(f.events).toHaveLength(1);
        expect(f.row.llm_retry_pending).toBeNull();
    });

    test("a replaced pending retry cannot be marked started by a stale waiter", async () => {
        const f = fixture(4);
        f.row.llm_retry_pending = pending();
        f.beforeLock(() => { f.row.llm_retry_pending = { ...pending(), retryId: "replacement" }; });
        await f.wait();
        expect(f.events).toEqual([]);
        expect(f.row.llm_retry_pending.retryId).toBe("replacement");
    });

    test("abort interrupts a long recovered wait without a start marker", async () => {
        const f = fixture(4);
        f.row.llm_retry_pending = pending(Date.now() + 60_000);
        const waiting = f.wait();
        const abortTimer = setTimeout(() => f.controller.abort(), 5);
        try { await expect(waiting).rejects.toMatchObject({ name: "AbortError" }); }
        finally { clearTimeout(abortTimer); }
        expect(f.events).toEqual([]);
        expect(f.row.llm_retry_pending.retryId).toBe("persisted-retry");
    });

    for (const operation of ["schedule", "wait"] as const) {
        test(`${operation} rolls back durable state when event persistence fails`, async () => {
            const f = fixture(4);
            f.row.llm_retry_pending = pending();
            const snapshot = structuredClone(f.row);
            f.failEvents();
            await expect(f[operation]()).rejects.toThrow("event persistence failed");
            expect(f.row).toEqual(snapshot);
            expect(f.events).toEqual([]);
        });
    }
});
