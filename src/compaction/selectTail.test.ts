import { describe, expect, test } from "bun:test";
import estimateTokens from "./estimateTokens";
import selectTail from "./selectTail";

type Options = Parameters<typeof selectTail>[2];
type Message = Options["messages"][number];
const ctx = { fns: { compaction: { estimateTokens: (opts: Parameters<typeof estimateTokens>[2]) => estimateTokens(ctx, null, opts) } } } as Context;
const select = (messages: Message[], budgets: Omit<Options, "messages"> = {}) => selectTail(ctx, null, { messages, ...budgets });
const chars = (messages: Message[]) => messages.reduce((sum, message) => sum
    + (typeof message.content === "string" ? message.content.length : JSON.stringify(message.content ?? "").length)
    + JSON.stringify(message.tool_calls ?? []).length, 0);
const call = (ids: string[]): Message => ({ role: "assistant", content: "", tool_calls: ids.map(id => ({ id })) });
const result = (id?: string): Message => ({ role: "tool", content: "done", ...(id ? { tool_call_id: id } : {}) });
const root: Message = { role: "system", content: "Original root instructions" };

async function assertBounded(messages: Message[], budgets: Omit<Options, "messages">, expectedStart: number) {
    const before = structuredClone(messages);
    const selected = await select(messages, budgets);
    expect(selected.tailStart).toBe(expectedStart);
    expect(selected.chars).toBe(chars(messages.slice(expectedStart)));
    expect(selected.chars).toBeLessThanOrEqual(budgets.maxChars ?? 120_000);
    expect(selected.tokens).toBeLessThanOrEqual(budgets.maxTokens ?? 30_000);
    expect(selected.tokens).toBeGreaterThanOrEqual(await estimateTokens(ctx, null, { messages: messages.slice(expectedStart) }));
    expect(messages).toEqual(before);
    return selected;
}

describe("compaction.selectTail (isolated)", () => {
    test("empty input and missing content", async () => {
        expect(await select([])).toEqual({ tailStart: 0, tokens: 0, chars: 0 });
        expect(await select([{ role: "user" }])).toEqual({ tailStart: 0, tokens: 1, chars: 4 });
    });

    test("all messages including root are retained when they fit; input root is never mutated", async () => {
        const messages = [structuredClone(root), { role: "user", content: "hi" }, { role: "assistant", content: "ok" }];
        const rootReference = messages[0];
        await assertBounded(messages, {}, 0);
        await assertBounded(messages, { maxChars: 4 }, 2);
        expect(messages[0]).toBe(rootReference);
        expect(messages[0]).toEqual(root);
    });

    test("both explicit limits are inclusive and select the longest bounded suffix", async () => {
        const messages = [root, { role: "user", content: "abcd" }, { role: "assistant", content: "efgh" }];
        expect(await assertBounded(messages, { maxChars: 12, maxTokens: 4 }, 1)).toEqual({ tailStart: 1, chars: 12, tokens: 4 });
        await assertBounded(messages, { maxChars: 11, maxTokens: 4 }, 2);
        await assertBounded(messages, { maxChars: 12, maxTokens: 3 }, 2);
    });

    test("parallel tool results cannot be separated from their assistant", async () => {
        const group = [call(["a", "b"]), result("b"), result("a")];
        const messages = [root, ...group];
        await assertBounded(messages, { maxChars: chars(group) }, 1);
        await assertBounded(messages, { maxChars: chars(group) - 1 }, messages.length);
        const withLaterText = [...messages, { role: "user", content: "next" }];
        await assertBounded(withLaterText, { maxChars: chars(group) - 1 }, messages.length);
    });

    test("interleaved calls and results form one indivisible overlapping span", async () => {
        const group = [call(["a", "b"]), result("a"), { role: "user", content: "interleaved" }, call(["c"]), result("b"), result("c")];
        const messages = [root, ...group];
        await assertBounded(messages, { maxChars: chars(group) }, 1);
        await assertBounded(messages, { maxChars: chars(group) - 1 }, messages.length);
    });

    test("independent complete exchanges can be cut between groups", async () => {
        const older = [call(["old"]), result("old")];
        const newer = [call(["new"]), result("new")];
        await assertBounded([root, ...older, ...newer], { maxChars: chars(newer) }, 3);
    });

    test("legacy missing or unknown result IDs retain the adjacent parallel call", async () => {
        for (const id of [undefined, "unknown"]) {
            const group = [call(["a"]), result(id), result(id)];
            await assertBounded([root, ...group], { maxChars: chars(group) }, 1);
            await assertBounded([root, ...group], { maxChars: chars(group) - 1 }, 4);
        }
    });

    test("a bare tool result cannot start a retained suffix", async () => {
        const messages = [root, result("missing"), { role: "user", content: "next" }];
        await assertBounded(messages, { maxChars: chars(messages.slice(1)) }, 2);
        await assertBounded([result("missing")], {}, 1);
        await assertBounded([result("missing"), { role: "user", content: "next" }], {}, 1);
    });

    test("few text messages do not exempt a giant image from the default character cap", async () => {
        const image: Message = { role: "user", content: [{ type: "image", data: "A".repeat(200_000) }] };
        await assertBounded([root, image], {}, 2);
        await assertBounded([root, image, { role: "assistant", content: "ok" }], {}, 2);
    });

    test("few messages with giant text still obey the default token cap", async () => {
        const giant: Message = { role: "user", content: "x".repeat(120_000) };
        await assertBounded([root, giant], { maxChars: 1_000_000 }, 2);
        await assertBounded([root, giant, { role: "assistant", content: "ok" }], { maxChars: 1_000_000 }, 2);
    });

    test("image token budget counts every image without dependence on bytes", async () => {
        const image: Message = { role: "user", content: [{ type: "image_ref", ref: "one" }, { type: "image_url", image_url: { url: "two" } }] };
        expect(await assertBounded([image], { maxTokens: 8193 }, 0)).toMatchObject({ tokens: 8193 });
        await assertBounded([image], { maxTokens: 8192 }, 1);
    });

    test("oversized newest tool exchange returns an empty tail, not a partial exchange", async () => {
        const messages = [root, call(["a"]), { ...result("a"), content: "x".repeat(200_000) }];
        expect(await select(messages)).toEqual({ tailStart: messages.length, tokens: 0, chars: 0 });
    });

    test("zero budgets allow only the empty tail", async () => {
        for (const budgets of [{ maxTokens: 0 }, { maxChars: 0 }, { maxTokens: 0, maxChars: 0 }]) {
            expect(await select([{ role: "user", content: "" }], budgets)).toEqual({ tailStart: 1, tokens: 0, chars: 0 });
            expect(await select([], budgets)).toEqual({ tailStart: 0, tokens: 0, chars: 0 });
        }
    });

    test("negative and nonfinite budgets are rejected even for empty input", async () => {
        for (const key of ["maxTokens", "maxChars"] as const) {
            for (const value of [-1, NaN, Infinity, -Infinity]) {
                await expect(select([], { [key]: value })).rejects.toThrow(TypeError);
                await expect(select([root], { [key]: value })).rejects.toThrow("Tail budgets must be finite and nonnegative");
            }
        }
    });
});
