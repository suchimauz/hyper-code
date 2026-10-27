import { test, expect, describe } from "bun:test";
import stream from "./streamAnthropic";
import parseSSE from "./parseSSE";
import toAnthropicMessages from "./toAnthropicMessages";

// Offline: drive streamAnthropic through the shared parseSSE with a mocked
// fetch and capture the request body that reaches the MiniMax gateway.
function mkCtx(modelId: string, applied: string, opts?: { tier?: string; maxTokens?: number }): { ctx: Context; sent: () => any } {
    let body: any = null;
    const ctx: any = { state: {}, env: {} };
    ctx.fns = {
        agent: {
            cacheRoot: async (o: any) => o.agent.id,
            buildLlmRequest: async () => ({ system: "sys", messages: [{ role: "user", content: "hi" }] }),
            wireTools: () => [],
        },
        llm: {
            resolveEndpoint: () => ({ url: "http://mock/v1/messages", modelId, apiKey: "k", provider: "minimax-coding", api: "anthropic" }),
            parseSSE: (o: any) => parseSSE(ctx, null, o),
            resolveReasoningEffort: async () => ({ requested: applied, applied, mode: "anthropic-adaptive", downgraded: false, reason: null }),
            connectFetch: async (o: any) => {
                body = JSON.parse(o.init.body);
                const enc = new TextEncoder();
                return new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode('event: message_stop\ndata: {"type":"message_stop"}\n\n')); c.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
            },
            toAnthropicMessages: (o: any) => toAnthropicMessages(ctx, null, o),
        },
        settings: {
            getNumber: async () => opts?.maxTokens ?? 16384,
            getString: async () => opts?.tier ?? "standard",
        },
    };
    return { ctx: ctx as unknown as Context, sent: () => body };
}

async function capture(modelId: string, applied: string, opts?: { tier?: string; maxTokens?: number }) {
    const { ctx, sent } = mkCtx(modelId, applied, opts);
    await stream(ctx, null, { agent: { id: "a1", model: "minimax-coding:" + modelId, reasoningEffort: applied, systemPrompt: "", messages: [], scratchpad: {} } as any });
    return sent();
}

describe("streamAnthropic — MiniMax M Plan wire format", () => {
    test("the input count from the final message_delta wins over the zeroed message_start", async () => {
        // MiniMax reports zeros in message_start and the real numbers only in
        // the closing message_delta. Reading only the first would leave the
        // context meter at zero and auto-compaction blind.
        const { ctx } = mkCtx("MiniMax-M3.1-Flash", "low");
        const enc = new TextEncoder();
        ctx.fns.llm.connectFetch = async () => new Response(new ReadableStream({ start(c) {
            for (const frame of [
                'event: message_start\ndata: {"message":{"usage":{"input_tokens":0,"output_tokens":0,"cache_read_input_tokens":217}}}\n\n',
                'event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":22,"output_tokens":44,"cache_read_input_tokens":195}}\n\n',
                'event: message_stop\ndata: {"type":"message_stop"}\n\n',
            ]) c.enqueue(enc.encode(frame));
            c.close();
        } }), { status: 200, headers: { "content-type": "text/event-stream" } }) as any;
        const res = await stream(ctx, null, { agent: { id: "a1", model: "minimax-coding:MiniMax-M3.1-Flash", reasoningEffort: "low", systemPrompt: "", messages: [], scratchpad: {} } as any });
        expect(res.usage.prompt_tokens).toBe(217);
        expect(res.usage.completion_tokens).toBe(44);
    });

    test("M3.1-Flash sends adaptive thinking and the requested effort", async () => {
        const body = await capture("MiniMax-M3.1-Flash", "high");
        expect(body.thinking).toEqual({ type: "adaptive" });
        expect(body.output_config).toEqual({ effort: "high" });
    });

    test("xhigh is the user-facing Max choice and maps to the wire value max", async () => {
        const body = await capture("MiniMax-M3.1-Flash", "xhigh");
        expect(body.output_config).toEqual({ effort: "max" });
    });

    test("M3.1-Flash never receives thinking disabled, which the gateway rejects", async () => {
        const body = await capture("MiniMax-M3.1-Flash", "off");
        expect(body.thinking).toEqual({ type: "adaptive" });
        expect(body.output_config).toEqual({ effort: "low" });
    });

    test("M3 with thinking off sends no thinking field at all", async () => {
        const body = await capture("MiniMax-M3", "off");
        expect(body.thinking).toBeUndefined();
        expect(body.output_config).toBeUndefined();
    });

    test("M2.x sends no thinking control because it always reasons", async () => {
        const body = await capture("MiniMax-M2.7", "high");
        expect(body.thinking).toBeUndefined();
        expect(body.output_config).toBeUndefined();
    });

    test("the admission tier reaches the request, except on M3.1-Flash", async () => {
        const m3 = await capture("MiniMax-M3", "high", { tier: "priority" });
        expect(m3.service_tier).toBe("priority");
        const flash = await capture("MiniMax-M3.1-Flash", "high", { tier: "priority" });
        expect(flash.service_tier).toBeUndefined();
    });

    test("legacy output-budget settings do not reach the MiniMax request", async () => {
        const body = await capture("MiniMax-M3", "high", { maxTokens: 32768 });
        expect(body).not.toHaveProperty("max_tokens");
    });
});
