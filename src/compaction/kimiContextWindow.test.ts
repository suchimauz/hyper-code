import { describe, expect, test } from "bun:test";
import windowSize from "./contextWindow";

const ctx: any = { fns: { compaction: { modelIdentity: async (o: any) => {
    const m = /^([a-z][\w-]*)(?:\/([\w.-]+))?:(.+)$/.exec(o.model);
    if (!m) return null;
    return { provider: m[1]!, account: m[2] ?? "default", modelId: m[3]!, relay: false };
} } } };

describe("compaction.contextWindow Kimi Coding", () => {
    // Kimi publishes a real per-model window. The generic "kimi" rule would
    // answer 128K for all of them and compact an 8x-too-small conversation.
    test("K2.8 and K3 carry a 1M window", async () => {
        expect(await windowSize(ctx, null, { model: "kimi-coding:kimi-for-coding" })).toBe(1_048_576);
        expect(await windowSize(ctx, null, { model: "kimi-coding:k3" })).toBe(1_048_576);
    });

    test("the 256K variants stay at their real cap", async () => {
        expect(await windowSize(ctx, null, { model: "kimi-coding:k3-256k" })).toBe(262_144);
        expect(await windowSize(ctx, null, { model: "kimi-coding:kimi-for-coding-highspeed" })).toBe(262_144);
    });

    test("an unknown Kimi model does not silently claim 1M", async () => {
        // A guessed window would let a model overflow instead of compacting.
        expect(await windowSize(ctx, null, { model: "kimi-coding:kimi-mystery" })).toBe(1_048_576);
    });
});