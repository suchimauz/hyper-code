import { expect, test } from "bun:test";
import deliverWatch from "./deliverWatch";

function harness(stoppedInitially: boolean, stopDuringPredicate = false, timeout = false) {
    let stopped = stoppedInitially;
    let locked = false;
    let predicates = 0;
    const writes: string[] = [];
    const row = { id: "watch", agent_id: "agent", opts: {}, timeout_at: timeout ? 0 : 1000, interval_ms: 20, predicate: "file.exists" };
    const ctx: any = { fns: {
        procs: { db: {
            transaction: async ({ fn }: any) => { locked = true; try { return await fn(); } finally { locked = false; } },
            select: async ({ sql }: any) => {
                if (sql.includes("FROM agents")) {
                    expect(locked).toBe(true); expect(sql).toContain("FOR UPDATE");
                    return [{ stopped_at: stopped ? 123 : null, archived_at: null }];
                }
                return [row];
            },
            run: async ({ sql }: any) => { expect(locked).toBe(true); writes.push(sql); return { changes: 1 }; },
        } },
        agent: { watchPredicate: async () => { predicates++; if (stopDuringPredicate) stopped = true; return { ready: true }; } },
        session: { appendMessage: async () => { throw new Error("must not append"); } },
    } };
    return { ctx, writes, predicates: () => predicates };
}

for (const claimed of [false, true]) {
    test(`stopped legacy watch skips predicate and preserves pending watch (claimed=${claimed})`, async () => {
        const h = harness(true);
        expect(await deliverWatch(h.ctx, null, { watchId: "watch", now: 100, claimed })).toEqual({ status: "waiting" });
        expect(h.predicates()).toBe(0);
        expect(h.writes).toHaveLength(1);
        expect(h.writes[0]).toContain("SET status = 'active'");
        expect(h.writes[0]).not.toContain("next_check_at");
    });
}

test("Stop racing watch predicate prevents completion and prompt append", async () => {
    const h = harness(false, true);
    expect(await deliverWatch(h.ctx, null, { watchId: "watch", now: 100 })).toEqual({ status: "waiting" });
    expect(h.predicates()).toBe(1);
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]).toContain("SET status = 'active'");
});

test("stopped timed-out legacy watch remains pending", async () => {
    const h = harness(true, false, true);
    expect(await deliverWatch(h.ctx, null, { watchId: "watch", now: 100 })).toEqual({ status: "waiting" });
    expect(h.predicates()).toBe(0);
    expect(h.writes[0]).not.toContain("finished_at");
});
