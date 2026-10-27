import { describe, expect, test } from "bun:test";
import call from "./call";

// MiniMax selects its server budget; neither generic caller budgets nor the
// removed plan setting should cap its hidden reasoning.
async function captureRequest(run: (callMiniMax: (opts: { max_tokens?: number }) => Promise<any>) => Promise<void>): Promise<{ request: any; headers: any }> {
    const previousFetch = globalThis.fetch;
    const captured: { request: any; headers: any } = { request: null, headers: null };
    globalThis.fetch = (async (_url: any, init: any) => {
        captured.request = JSON.parse(init.body);
        captured.headers = init.headers;
        return Response.json({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 2 } });
    }) as any;
    const ctx: any = { state: {}, env: {}, fns: {
        settings: { getNumber: async () => 16384 },
        llm: { resolveEndpoint: async () => ({ url: "https://example.test/v1/messages", modelId: "MiniMax-M3.1-Flash", apiKey: "k", provider: "minimax-coding", account: "default", kind: "subscription", api: "anthropic" }) },
    } };
    const callMiniMax = (opts: { max_tokens?: number }) => call(ctx, null, { model: "minimax-coding:MiniMax-M3.1-Flash", user: "hi", noFallback: true, ...opts });
    try { await run(callMiniMax); }
    finally { globalThis.fetch = previousFetch; }
    return captured;
}

describe("llm.call — MiniMax M Plan", () => {
    test("a generic small caller budget is not imposed on MiniMax", async () => {
        const { request } = await captureRequest(async callMiniMax => { await callMiniMax({ max_tokens: 120 }); });
        expect(request).not.toHaveProperty("max_tokens");
    });

    test("a generic larger caller budget is not imposed on MiniMax", async () => {
        const { request } = await captureRequest(async callMiniMax => { await callMiniMax({ max_tokens: 32768 }); });
        expect(request).not.toHaveProperty("max_tokens");
    });

    test("the request asks for adaptive thinking and a shallow effort", async () => {
        const { request } = await captureRequest(async callMiniMax => { await callMiniMax({}); });
        expect(request).not.toHaveProperty("max_tokens");
        expect(request.thinking).toEqual({ type: "adaptive" });
        expect(request.output_config).toEqual({ effort: "low" });
    });

    test("the key is sent the way the gateway expects it", async () => {
        const { headers } = await captureRequest(async callMiniMax => { await callMiniMax({}); });
        expect(headers["x-api-key"]).toBe("k");
        expect(headers.authorization).toBeUndefined();
    });
});
