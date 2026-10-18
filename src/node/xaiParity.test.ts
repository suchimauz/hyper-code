import { expect, test } from "bun:test";
import stream from "../llm/stream";
import streamXai from "../llm/streamXai";
import call from "../llm/call";
import upstream from "./upstream";
import catalog from "./catalog";
import resolveEndpoint from "../llm/resolveEndpoint";

const ep = { provider: "hyper", upstream: "xai", account: "host", modelId: "xai/named:grok-test", api: "responses", apiKey: "node-token", url: "http://node/responses", kind: "subscription" };
const reasoning = { requested: "auto", applied: "high", mode: "effort" };
const sse = 'data: {"type":"response.completed","response":{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"ok"}]}],"usage":{"input_tokens":2,"output_tokens":1}}}\n\n';
const forbidden = () => { throw new Error("client must not touch OAuth/Codex"); };

test("Hyper xai dispatcher selects xai, never Codex", async () => {
    const ctx = { fns: { llm: { resolveEndpoint: async () => ep, resolveReasoningEffort: async () => reasoning, streamXai: async () => ({ text: "xai" }), streamCodex: forbidden }, procs: {} } } as unknown as Context;
    expect((await stream(ctx, null, { agent: { id: "test", model: "hyper/host:xai/named:grok-test" } as any })).text).toBe("xai");
});

test("xai stream keeps node bearer, canonical wire model, tools and no Codex identity", async () => {
    let sent: any;
    const ctx = { fns: { llm: { resolveEndpoint: async () => ep, resolveReasoningEffort: async () => reasoning, getXaiOAuthToken: forbidden, accountAuthHealth: forbidden, refreshUsage: forbidden, toCodexInput: () => ({ input: [{ role: "user", content: "hi" }] }), connectFetch: async (o: any) => { sent = o; return new Response(sse); }, parseSSE: async function* () { yield { data: JSON.stringify({ type: "response.completed", response: { usage: { input_tokens: 2, output_tokens: 1 } } }) }; } }, agent: { buildLlmRequest: async () => ({ system: "system", messages: [] }), wireTools: () => [{ type: "function", name: "tool" }], cacheRoot: async () => "root" } } } as unknown as Context;
    await streamXai(ctx, null, { agent: { id: "test", model: "hyper/host:xai/named:grok-test" } as any });
    expect(sent.init.headers.authorization).toBe("Bearer node-token");
    expect(sent.init.headers["chatgpt-account-id"]).toBeUndefined();
    expect(JSON.parse(sent.init.body)).toMatchObject({ model: ep.modelId, reasoning: { effort: "high" }, prompt_cache_key: "root", tools: [{ name: "tool" }] });
});

for (const provider of ["xai", "codex"]) test(`non-agent Hyper ${provider} call preserves relay credentials`, async () => {
    const original = globalThis.fetch;
    let sent: any;
    const ctx = { fns: { llm: { resolveEndpoint: async () => ({ ...ep, upstream: provider }), getXaiOAuthToken: forbidden, refreshCodex: forbidden, refreshUsage: forbidden } } } as unknown as Context;
    globalThis.fetch = (async (_url: any, init: any) => { sent = init; return new Response(sse); }) as typeof fetch;
    try {
        const result = await call(ctx, null, { model: `hyper/host:${provider}/named:test`, user: "hi", noFallback: true, max_tokens: 123 });
        expect(result.text).toBe("ok");
        expect(sent.headers.authorization).toBe("Bearer node-token");
        expect(sent.headers["chatgpt-account-id"]).toBeUndefined();
        expect(JSON.parse(sent.body).model).toBe(ep.modelId);
        if (provider === "xai") { expect(JSON.parse(sent.body).max_output_tokens).toBe(123); expect(JSON.parse(sent.body).text).toBeUndefined(); }
    } finally { globalThis.fetch = original; }
});

test("host refreshes xai OAuth for selected account and forwards session", async () => {
    let account: string | undefined;
    const ctx = { fns: { llm: { resolveEndpoint: async () => ({ ...ep, provider: "xai", apiKey: "old", url: "http://xai/responses" }), getXaiOAuthToken: async (o: any) => { account = o.account; return "fresh"; } } } } as unknown as Context;
    const result = await upstream(ctx, null, { provider: "xai", account: "named", api: "responses", sessionId: "root" });
    expect(account).toBe("named");
    expect(result?.headers).toEqual({ "content-type": "application/json", authorization: "Bearer fresh", accept: "text/event-stream", session_id: "root" });
});

test("catalog excludes direct and stale chained Cursor; stale resolution is explicit", async () => {
    const ctx = { fns: { llm: { listModels: async () => ({ cursor: ["cursor:m"], xai: ["xai:g"] }), resolveEndpoint: async ({ model }: any) => ({ api: model.startsWith("cursor") ? "cursor" : "responses", kind: "subscription" }) }, node: { list: async () => [{ name: "chain", enabled: true, catalog: [{ id: "cursor/named:m", api: "cursor", provider: "cursor" }] }], get: async () => ({ enabled: true, catalog: [{ id: "cursor/named:m", api: "cursor" }] }), token: forbidden } } } as unknown as Context;
    expect((await catalog(ctx, null, {})).map(x => x.id)).toEqual(["xai/default:g"]);
    await expect(resolveEndpoint(ctx, null, { model: "hyper/host:cursor/named:m" })).rejects.toThrow("Cursor transport is not supported");
});
