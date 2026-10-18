import { describe, expect, test } from "bun:test";
import appendEvent from "./appendEvent";

// All effects are local fixtures: no runtime context or database connection.
function fixture(failWrite = 0) {
    const navigation: object[] = [];
    const streams: object[] = [];
    let writes = 0;
    const ctx = { fns: {
        auth: { actorId: async () => null },
        procs: {
            db: { run: async () => {
                writes++;
                if (writes === failWrite) throw new Error("fixture write failed");
                return { rows: [{ idx: 7 }] };
            } },
            events: { refresh: (opts: object) => streams.push(opts) },
        },
        agent: { wakeWaiters: async () => {} },
        events: { emitAgentsChanged: (opts: object) => {
            expect(writes).toBe(2);
            navigation.push(opts);
        } },
    } } as unknown as Context;
    return { ctx, navigation, streams };
}

describe("appendEvent navigation unread invalidation", () => {
    for (const event of [
        { type: "assistant", text: "New reply" },
        { type: "error", error: "stopped by user" },
        { type: "error", error: "stopped by user: cancelled" },
    ]) test(`notifies once for ${JSON.stringify(event)}`, async () => {
        const f = fixture();
        expect(await appendEvent(f.ctx, null, { id: "fixture", event, ts: 42 })).toEqual({ idx: 7 });
        expect(f.navigation).toEqual([{ agentId: "fixture", reason: "unread/event" }]);
        expect(f.streams).toEqual([{ topic: "agent:fixture", reason: "event" }]);
    });

    for (const event of [
        { type: "tool", text: "tool output" },
        { type: "tool_result", text: "tool output" },
        { type: "assistant", text: " \n\t" },
        { type: "assistant", text: "" },
        { type: "assistant" },
        { type: "error", error: "" },
        { type: "error", error: "unrelated error" },
    ]) test(`does not notify for ${JSON.stringify(event)}`, async () => {
        const f = fixture();
        await appendEvent(f.ctx, null, { id: "fixture", event, ts: 42 });
        expect(f.navigation).toEqual([]);
        expect(f.streams).toHaveLength(1);
    });

    for (const failWrite of [1, 2]) test(`does not notify after failed write ${failWrite}`, async () => {
        const f = fixture(failWrite);
        await expect(appendEvent(f.ctx, null, {
            id: "fixture", event: { type: "assistant", text: "reply" }, ts: 42,
        })).rejects.toThrow("fixture write failed");
        expect(f.navigation).toEqual([]);
    });
});
