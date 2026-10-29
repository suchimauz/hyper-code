import { describe, expect, test } from "bun:test";
import estimateTokens from "./estimateTokens";

const ctx = {} as Context;
type Message = Parameters<typeof estimateTokens>[2]["messages"][number];
const estimate = (messages: Message[]) => estimateTokens(ctx, null, { messages });
const serializedEstimate = (messages: Message[]) => Math.ceil(messages.reduce((sum, message) =>
    sum + (typeof message.content === "string" ? message.content.length : message.content == null ? 0 : JSON.stringify(message.content).length)
    + JSON.stringify(message.tool_calls ?? []).length, 0) / 4);

const imageVariants = [
    ["canonical", (data: string) => ({ type: "image", data, mimeType: "image/png" })],
    ["OpenAI", (data: string) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${data}` } })],
    ["Anthropic", (data: string) => ({ type: "image", source: { type: "base64", media_type: "image/png", data } })],
    ["input_image", (data: string) => ({ type: "input_image", image_url: data })],
    ["image_ref", (data: string) => ({ type: "image_ref", ref: data })],
] as const;

describe("compaction.estimateTokens (isolated)", () => {
    test("empty and missing content are supported", async () => {
        expect(await estimate([])).toBe(0);
        expect(await estimate([{ role: "user" }, { role: "assistant", content: null }])).toBe(1);
    });

    for (const [name, image] of imageVariants) {
        test(`${name}: fixed image cost independent of payload length`, async () => {
            for (const data of ["x", "A".repeat(400_000)]) {
                expect(await estimate([{ role: "user", content: [image(data)] }])).toBe(4097);
                expect(await estimate([{ role: "user", content: image(data) }])).toBe(4097);
            }
        });
    }

    test("mixed text and multiple images accumulate their full costs", async () => {
        const text = { type: "text", text: "Read both pictures" };
        const content = [text, imageVariants[0][1]("a"), imageVariants[1][1]("b"), imageVariants[4][1]("c")];
        expect(await estimate([{ role: "user", content }])).toBe(3 * 4096 + Math.ceil((JSON.stringify(text).length + 2) / 4));
    });

    test("long text and tool-call arguments are never discounted", async () => {
        const messages = [
            { role: "user", content: "a".repeat(200_000) },
            { role: "assistant", tool_calls: [{ id: "call1", type: "function", function: { name: "write", arguments: JSON.stringify({ text: "b".repeat(200_000) }) } }] },
            { role: "tool", content: "c".repeat(200_000) },
        ];
        expect(await estimate(messages)).toBe(serializedEstimate(messages));
        expect(await estimate(messages)).toBeGreaterThan(150_000);
    });

    test("unknown blocks and opaque checkpoints keep their serialized estimate", async () => {
        for (const message of [
            { role: "user", content: { type: "unknown", payload: "x".repeat(20_000) } },
            { role: "assistant", message_type: "codex_compaction", content: { type: "compaction", encrypted_content: "x".repeat(20_000) } },
            { role: "assistant", message_type: "anthropic_compaction", content: JSON.stringify({ type: "compaction", content: "x".repeat(20_000) }) },
        ]) expect(await estimate([message])).toBe(serializedEstimate([message]));
    });

    test("does not alter message objects or their nested content", async () => {
        const messages = [{ role: "user", content: [imageVariants[2][1]("abc"), { type: "text", text: "hi" }] }];
        const before = structuredClone(messages);
        await estimate(messages);
        expect(messages).toEqual(before);
    });
});
