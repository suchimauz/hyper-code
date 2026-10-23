import { expect, test } from "bun:test";
import injectScheduledPrompt from "./injectScheduledPrompt";

function harness(stoppedAt: number | null) {
    let locked = false;
    const effects: string[] = [];
    const ctx: any = { state: { agent: {} }, fns: {
        procs: { db: {
            transaction: async ({ fn }: any) => { locked = true; try { return await fn(); } finally { locked = false; } },
            select: async ({ sql }: any) => {
                expect(locked).toBe(true);
                expect(sql).toContain("FOR UPDATE");
                return [{ id: "agent", stopped_at: stoppedAt }];
            },
            run: async ({ sql }: any) => { expect(locked).toBe(true); expect(sql).not.toContain("stopped_at="); effects.push("schedule"); },
        } },
        session: { appendUserMessage: async ({ text }: any) => { expect(locked).toBe(true); expect(text).toBe("tick"); effects.push("append"); return { idx: 2 }; } },
        events: { refreshAgentMeta: () => effects.push("refresh") },
        agent: { wakeWorker: () => effects.push("wake") },
    } };
    return { ctx, effects };
}

test("scheduled prompt rechecks durable Stop under row lock without transcript writes", async () => {
    const h = harness(0);
    expect(await injectScheduledPrompt(h.ctx, null, { agentId: "agent", text: "tick" })).toEqual({
        agentId: "agent", messageIdx: null, scheduled: false, reason: "stopped",
    });
    expect(h.effects).toEqual([]);
});

test("scheduled prompt appends and schedules atomically for a non-stopped agent", async () => {
    const h = harness(null);
    expect(await injectScheduledPrompt(h.ctx, null, { agentId: "agent", text: "tick" })).toEqual({
        agentId: "agent", messageIdx: 2, scheduled: true,
    });
    expect(h.effects).toEqual(["append", "schedule", "refresh", "wake"]);
});
