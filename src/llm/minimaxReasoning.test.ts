import { describe, expect, test } from "bun:test";
import capabilities from "./reasoningCapabilities";
import resolve from "./resolveReasoningEffort";

const ctx: any = { fns: { llm: { reasoningCapabilities: (o: any) => capabilities(ctx, null, o) } } };

describe("llm.reasoningCapabilities MiniMax M Plan", () => {
    test("M3.1-Flash always thinks and offers low…max without off", async () => {
        const result = await capabilities({} as Context, null, { model: "minimax-coding:MiniMax-M3.1-Flash" });
        expect(result.mode).toBe("anthropic-adaptive");
        expect(result.supported).toEqual(["auto", "low", "medium", "high", "xhigh"]);
        expect(result.supported).not.toContain("off");
        expect(result.defaultEffort).toBe("xhigh");
    });

    test("M3 can think off but never below low", async () => {
        const result = await capabilities({} as Context, null, { model: "minimax-coding:MiniMax-M3" });
        expect(result.mode).toBe("anthropic-adaptive");
        expect(result.supported).toEqual(["auto", "off", "low", "medium", "high", "xhigh"]);
        expect(result.defaultEffort).toBe("off");
    });

    test("M2.x always reasons and exposes no levels", async () => {
        const result = await capabilities({} as Context, null, { model: "minimax-coding:MiniMax-M2.7" });
        expect(result.mode).toBe("none");
        expect(result.supported).toEqual(["auto", "off"]);
    });

    test("a level MiniMax rejects downgrades instead of failing", async () => {
        // "off" is illegal on M3.1-Flash — it must land on the lowest legal level.
        const r = await resolve(ctx, null, { model: "minimax-coding:MiniMax-M3.1-Flash", effort: "off" });
        expect(r.applied).toBe("low");
        expect(r.downgraded).toBe(true);
        expect(r.mode).toBe("anthropic-adaptive");
    });

    test("every offered level is applied as requested", async () => {
        for (const effort of ["low", "medium", "high", "xhigh"] as const) {
            const r = await resolve(ctx, null, { model: "minimax-coding:MiniMax-M3.1-Flash", effort });
            expect(r.applied).toBe(effort);
            expect(r.downgraded).toBe(false);
        }
    });
});
