import { expect, test } from "bun:test";
import run from "./run";

test("direct runs track in-flight lifetime and release their controller on failure", async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const agent = { id: "test", abortController: null, scratchpad: {} } as unknown as types.agent.Agent;
    const ctx = { fns: { session: {
        forAgent: () => null,
        appendUserMessage: async () => { await pending; throw new Error("fixture failure"); },
    } } } as unknown as Context;
    const result = run(ctx, null, { agent, userText: "test" });
    expect(agent.activeRunCount).toBe(1);
    expect(agent.abortController).toBeInstanceOf(AbortController);
    release();
    await expect(result).rejects.toThrow("fixture failure");
    expect(agent.activeRunCount).toBe(0);
    expect(agent.abortController).toBeNull();
});

test("run cleanup preserves a replacement controller owned by another run", async () => {
    const replacement = new AbortController();
    const agent = { id: "test", activeRunCount: 1, scratchpad: {} } as unknown as types.agent.Agent;
    const ctx = { fns: { session: {
        forAgent: () => null,
        appendUserMessage: async () => { agent.abortController = replacement; throw new Error("fixture failure"); },
    } } } as unknown as Context;
    await expect(run(ctx, null, { agent, userText: "test" })).rejects.toThrow("fixture failure");
    expect(agent.activeRunCount).toBe(1);
    expect(agent.abortController).toBe(replacement);
});
