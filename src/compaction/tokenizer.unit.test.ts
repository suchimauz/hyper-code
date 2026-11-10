import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tokenizerFor from "./tokenizerFor";
import tokenizer from "./tokenizer";
import estimateTokens from "./estimateTokens";
import calibration from "./calibration";

const makeCtx = (extra: any = {}): any => {
    const warnings: string[] = [];
    const ctx: any = {
        env: extra.env ?? {}, state: {}, warnings,
        fns: {
            procs: { log: { warn: ({ msg }: any) => warnings.push(msg) }, db: { select: extra.select ?? (async () => []) } },
            compaction: {
                tokenizerFor: (o: any) => tokenizerFor(ctx, null, o),
                tokenizer: extra.tokenizer ?? ((o: any) => tokenizer(ctx, null, o)),
            },
        },
    };
    return ctx;
};

describe("compaction.tokenizerFor", () => {
    test("maps model families regardless of provider prefixes", async () => {
        const cases: Array<[string, string, string?]> = [
            ["codex:gpt-5.5", "tiktoken-o200k"],
            ["ssh/aeza:codex/acc:gpt-6-astra", "tiktoken-o200k"],
            ["mauzcode/mini:codex/acc:gpt-6.1-sol", "tiktoken-o200k"],
            ["ssh/a:kimi-coding/T:kimi-for-coding", "tiktoken-kimi", "moonshotai/Kimi-K3"],
            ["ssh/a:kimi-coding/T:k3.1-pro", "tiktoken-kimi", "moonshotai/Kimi-K3"],
            ["oneapi:qwen3.8-flash-next", "hf", "Qwen/Qwen3.8-Flash-Next"],
            ["oneapi:gemma4-26b", "hf", "google/gemma-4-26B-A4B-it"],
            ["opencode:deepseek-v4.1-flash", "hf", "deepseek-ai/DeepSeek-V4.1-Flash"],
            ["zai-coding:glm-5.3", "hf", "zai-org/GLM-5.3"],
            ["minimax-coding:MiniMax-M3.1-Flash", "hf", "MiniMaxAI/MiniMax-M3"],
            ["ssh/a:claude-code/b:claude-opus-5-5", "none"],
            ["mystery:model", "none"],
        ];
        for (const [model, kind, repo] of cases) expect(await tokenizerFor({} as any, null, { model })).toEqual(repo ? { kind: kind as any, repo } : { kind: kind as any });
    });
});

describe("compaction.tokenizer", () => {
    const realFetch = globalThis.fetch;
    let home = "";
    afterEach(async () => { globalThis.fetch = realFetch; if (home) await rm(home, { recursive: true, force: true }); home = ""; });

    test("o200k counts a fixed string and copes with long unbroken runs", async () => {
        const ctx = makeCtx();
        const count = await tokenizer(ctx, null, { model: "codex:gpt-5.5", wait: true });
        expect(count).not.toBeNull();
        expect(count!("hello world")).toBe(2);
        expect(count!("")).toBe(0);
        const started = performance.now();
        expect(count!("a".repeat(20000))).toBeGreaterThan(1000);
        expect(performance.now() - started).toBeLessThan(5000);
        expect(await tokenizer(ctx, null, { model: "codex:gpt-5.5" })).toBe(count);
    });

    test("no tokenizer for Claude", async () => {
        expect(await tokenizer(makeCtx(), null, { model: "claude-code:claude-opus-5-5", wait: true })).toBeNull();
    });

    test("unreachable Hugging Face falls back to null, logs once and backs off", async () => {
        home = await mkdtemp(join(tmpdir(), "tok-"));
        let calls = 0;
        globalThis.fetch = (async () => { calls++; throw new Error("offline"); }) as any;
        const ctx = makeCtx({ env: { HOME: home } });
        expect(await tokenizer(ctx, null, { model: "zai-coding:glm-5.3", wait: true })).toBeNull();
        expect(ctx.warnings.length).toBe(1);
        expect(await tokenizer(ctx, null, { model: "zai-coding:glm-5.3", wait: true })).toBeNull();
        expect(calls).toBe(1);
    });
});

describe("compaction.estimateTokens with model", () => {
    const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
    test("uses the tokenizer for text, text blocks and tool calls, plus framing", async () => {
        const ctx = makeCtx({ tokenizer: async ({ model }: any) => model === "m:tok" ? words : null });
        const messages = [
            { role: "user", content: "one two three" },
            { role: "assistant", content: [{ type: "text", text: "four five" }, { type: "image", data: "x", mimeType: "image/png" }], tool_calls: [{ id: "a" }] },
        ];
        expect(await estimateTokens(ctx, null, { messages, model: "m:tok" })).toBe(3 + 4 + 2 + words(JSON.stringify([{ id: "a" }])) + 4 + 4096);
        expect(await estimateTokens(ctx, null, { messages, model: "m:none" })).toBe(await estimateTokens(ctx, null, { messages }));
    });
});

describe("compaction.calibration", () => {
    const row = (model: string, prompt: number, estimate: number, source = "heuristic") => ({ payload: JSON.stringify({ model, usage: { prompt_tokens: prompt }, estimatedPromptTokens: estimate, estimateSource: source }) });
    const calib = (rows: any[], tok: any = null) => calibration(makeCtx({ select: async () => rows, tokenizer: async () => tok }), null, { model: "m:x" });

    test("median ratio of matching samples", async () => {
        const rows = [row("m:x", 120, 100), row("m:x", 150, 100), row("m:x", 130, 100), row("m:other", 900, 100), row("m:x", 500, 100, "tokenizer"), { payload: "{bad" }];
        expect(await calib(rows)).toEqual({ factor: 1.3, samples: 3, source: "heuristic" });
    });
    test("fewer than three samples keeps 1", async () => {
        expect((await calib([row("m:x", 200, 100), row("m:x", 200, 100)])).factor).toBe(1);
    });
    test("clamps to 0.5..3", async () => {
        expect((await calib([row("m:x", 900, 100), row("m:x", 900, 100), row("m:x", 900, 100)])).factor).toBe(3);
        expect((await calib([row("m:x", 10, 100), row("m:x", 10, 100), row("m:x", 10, 100)])).factor).toBe(0.5);
    });
    test("tokenizer estimates only compare with tokenizer samples", async () => {
        const rows = [row("m:x", 110, 100, "tokenizer"), row("m:x", 110, 100, "tokenizer"), row("m:x", 110, 100, "tokenizer"), row("m:x", 300, 100)];
        expect(await calib(rows, () => 1)).toEqual({ factor: 1.1, samples: 3, source: "tokenizer" });
    });
});
