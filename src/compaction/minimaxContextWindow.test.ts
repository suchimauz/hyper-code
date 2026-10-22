import { describe, expect, test } from "bun:test";
import windowSize from "./contextWindow";

const ctx: any = { fns: { compaction: { modelIdentity: async (o: any) => {
    const m = /^([a-z][\w-]*)(?:\/([\w.-]+))?:(.+)$/.exec(o.model);
    if (!m) return null;
    return { provider: m[1]!, account: m[2] ?? "default", modelId: m[3]!, relay: false };
} } } };

describe("compaction.contextWindow MiniMax M Plan", () => {
    test("the M3 generation has a 512K working window", async () => {
        expect(await windowSize(ctx, null, { model: "minimax-coding:MiniMax-M3.1-Flash" })).toBe(512_000);
        expect(await windowSize(ctx, null, { model: "minimax-coding:MiniMax-M3" })).toBe(512_000);
    });

    test("the older M2 line has a 204,800-token window", async () => {
        expect(await windowSize(ctx, null, { model: "minimax-coding:MiniMax-M2.7" })).toBe(204_800);
        expect(await windowSize(ctx, null, { model: "minimax-coding:MiniMax-M2.5" })).toBe(204_800);
    });

    test("an unknown MiniMax model reports no window rather than a guess", async () => {
        expect(await windowSize(ctx, null, { model: "minimax-coding:MiniMax-Mystery" })).toBeNull();
    });
});
