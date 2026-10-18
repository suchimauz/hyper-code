import { expect, test } from "bun:test";
import steer from "./steer";

test("steer persists notifications before guarded scheduling, without trusting cached parent state", async () => {
    const calls: string[] = [];
    let schedulingSql = "";
    const parent = { id: "parent", scratchpad: {} };
    const ctx: any = {
        state: { agent: { parent } },
        fns: {
            session: {
                appendMessage: async (opts: any) => {
                    expect(opts.message.message_type).toBe("team_update");
                    expect(opts.message.content).toContain("kept result");
                    calls.push("message");
                    return { idx: 12 };
                },
                appendEvent: async (opts: any) => {
                    expect(opts.event.messageIdx).toBe(12);
                    calls.push("event");
                },
                syncAgentState: async () => { calls.push("sync"); },
            },
            procs: { db: { run: async (opts: any) => {
                schedulingSql = opts.sql;
                expect(opts.params[2]).toBe("parent");
                calls.push("schedule");
                return { changes: 0 };
            } } },
            events: { refreshAgentMeta: () => {} },
            agent: { wakeWorker: () => {} },
        },
    };
    const result = await steer(ctx, null, { from: { id: "child", parentId: "parent" } as any, event: "plan.completed", summary: "kept result" });
    expect(result).toEqual({ delivered: true, parentId: "parent", messageIdx: 12 });
    expect(calls).toEqual(["message", "event", "schedule", "sync"]);
    expect(schedulingSql).toContain("COALESCE(last_error, '') NOT LIKE 'stopped by user%'");
    expect(schedulingSql).toContain("NULLIF(scratchpad, '')::jsonb #>> '{plan,pausedAt}'");
    expect(schedulingSql).toContain("next_run_at = COALESCE(next_run_at, ?)");
});
