import { describe, expect, test } from "bun:test";
import relay from "./relay";

describe("node relay transport parity", () => {
    for (const chained of [false, true]) {
        test(`${chained ? "chained" : "direct"} preserves metadata, payload, errors and abort signal without leaking auth`, async () => {
            const original = globalThis.fetch;
            const controller = new AbortController();
            let sent: RequestInit | undefined;
            const model = "codex/named:gpt-test";
            const payload = {
                model, stream: true, reasoning: { effort: "high" },
                input: [{ role: "user", content: [{ type: "input_image", image_url: "data:image/png;base64,AAAA" }] },
                    { type: "function_call_output", call_id: "call-1", output: "tool result" }],
                tools: [{ type: "function", name: "test", parameters: { type: "object" } }],
            };
            const ctx = { fns: { node: {
                authorize: async () => ({ ok: true, client: { providers: ["codex"], name: "client" }, hops: 1 }),
                catalog: async () => [{ id: model, provider: "codex", account: "named", api: "responses", ...(chained ? { via: "hyper/next" } : {}) }],
                get: async () => ({ url: "http://next/v1" }), token: async () => "next-token",
                upstream: async () => ({ url: "http://provider", headers: { authorization: "Bearer host-token", "chatgpt-account-id": "host-account" } }),
            }, procs: { log: { info: () => {} } } } } as unknown as Context;
            const error = JSON.stringify({ error: { type: "usage_limit_reached", resets_at: 123456 } });
            globalThis.fetch = (async (_url, init) => {
                sent = init;
                return new Response(error, { status: 429, headers: { "content-type": "application/json", "retry-after": "60", "x-ratelimit-remaining": "0", "x-request-id": "req-1", "set-cookie": "private" } });
            }) as typeof fetch;
            try {
                const req = new Request("http://node/responses", { method: "POST", body: JSON.stringify(payload), signal: controller.signal,
                    headers: { authorization: "Bearer client-token", "chatgpt-account-id": "client-account", "session_id": "root-session", "x-codex-turn-metadata": '{"turn_id":"turn-1"}' } });
                const res = await relay(ctx, null, { req, api: "responses" });
                const headers = new Headers(sent?.headers);
                expect(headers.get("session_id")).toBe("root-session");
                expect(headers.get("x-codex-turn-metadata")).toBe('{"turn_id":"turn-1"}');
                expect(headers.get("authorization")).toBe(`Bearer ${chained ? "next" : "host"}-token`);
                expect(headers.get("chatgpt-account-id")).toBe(chained ? null : "host-account");
                if (chained) expect(headers.get("x-hyper-hops")).toBe("2");
                expect(JSON.parse(String(sent?.body))).toEqual({ ...payload, model: chained ? model : "gpt-test" });
                expect(sent?.signal).toBe(req.signal);
                controller.abort();
                expect(sent?.signal?.aborted).toBe(true);
                expect(res.status).toBe(429);
                expect(await res.text()).toBe(error);
                expect(res.headers.get("retry-after")).toBe("60");
                expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
                expect(res.headers.get("x-request-id")).toBe("req-1");
                expect(res.headers.get("set-cookie")).toBeNull();
            } finally { globalThis.fetch = original; }
        });
    }
    test("passes SSE tool/usage bytes without parsing or rewriting", async () => {
        const original = globalThis.fetch;
        const data = 'event: response.completed\ndata: {"response":{"usage":{"input_tokens":21,"output_tokens":8},"output":[{"type":"function_call","arguments":"{}"}]}}\n\n';
        const ctx = { fns: { node: {
            authorize: async () => ({ ok: true, client: { providers: ["codex"], name: "client" }, hops: 0 }),
            catalog: async () => [{ id: "codex/default:gpt-test", provider: "codex", account: "default", api: "responses" }],
            upstream: async () => ({ url: "http://provider", headers: {} }),
        }, procs: { log: { info: () => {} } } } } as unknown as Context;
        globalThis.fetch = (async () => new Response(data, { headers: { "content-type": "text/event-stream" } })) as typeof fetch;
        try {
            const res = await relay(ctx, null, { req: new Request("http://node/responses", { method: "POST", body: JSON.stringify({ model: "codex/default:gpt-test" }) }), api: "responses" });
            expect(res.headers.get("content-type")).toBe("text/event-stream");
            expect(await res.text()).toBe(data);
        } finally { globalThis.fetch = original; }
    });
});
