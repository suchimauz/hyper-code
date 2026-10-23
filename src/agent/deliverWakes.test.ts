import { expect, test } from "bun:test";
import deliverWakes from "./deliverWakes";

test("legacy wake remains pending if Stop wins before delivery lock", async () => {
    const effects: string[] = [];
    let locked = false;
    const ctx: any = { fns: {
        procs: { db: {
            select: async ({ sql }: { sql: string }) => {
                expect(sql).toContain("stopped_at IS NULL");
                if (sql.includes("FOR UPDATE")) { expect(locked).toBe(true); return []; }
                return [{ id: "paused" }];
            },
            transaction: async ({ fn }: any) => { locked = true; try { return await fn(); } finally { locked = false; } },
            run: async () => { effects.push("write"); },
        } },
        session: { appendMessage: async () => effects.push("message") },
        agent: { unpark: async () => effects.push("unpark"), wakeWorker: () => effects.push("wake") },
    } };
    expect(await deliverWakes(ctx, null, { now: 100 })).toEqual({ delivered: [] });
    expect(effects).toEqual([]);
});

test("stopped legacy wakes are excluded without consuming them", async () => {
    const ctx: any = { fns: { procs: { db: { select: async ({ sql }: any) => {
        expect(sql).toContain("stopped_at IS NULL"); return [];
    } } } } };
    expect(await deliverWakes(ctx, null, {})).toEqual({ delivered: [] });
});
