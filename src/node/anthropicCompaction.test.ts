import { describe, expect, test } from "bun:test";
import relay from "./relay";

describe("Anthropic compaction beta relay", () => {
    for (const provider of ["anthropic", "claude-code", "anthropic-oauth", "kimi-coding", "unknown"]) for (const chained of [false, true]) {
        test(`${provider} ${chained ? "chained" : "host"}: allowlisted beta only, host identity retained`, async () => {
            const original = globalThis.fetch;
            let sent: RequestInit | undefined;
            const model = `${provider}/named:claude-test`;
            const block = { type: "compaction", content: "summary", signature: "exact-signature" };
            const payload = { model, messages: [{ role: "user", content: [block, { type: "text", text: "continue" }] }], compaction: { type: "summarize" } };
            const ctx: any = { fns: { node: {
                authorize: async () => ({ ok: true, client: { providers: [provider], name: "client" }, hops: 0 }),
                catalog: async () => [{ id: model, provider, account: "named", api: "anthropic", ...(chained ? { via: "hyper/next" } : {}) }],
                get: async () => ({ url: "http://next" }), token: async () => "next-token",
                upstream: async () => ({ url: "http://mock", headers: { authorization: "Bearer host-token", "anthropic-beta": "oauth-host", "user-agent": "host-agent", "x-app": "host-app" } }),
            }, procs: { log: { info: () => {} } } } };
            globalThis.fetch = (async (_url, init) => { sent = init; return Response.json({ content: [block] }); }) as typeof fetch;
            try {
                const req = new Request("http://node/anthropic", { method: "POST", body: JSON.stringify(payload), headers: { authorization: "Bearer client-token", "x-api-key": "client-secret", "user-agent": "client-agent", "x-app": "client-app", "anthropic-beta": "evil-beta, compact-2026-09-04,oauth-client" } });
                const res = await relay(ctx, null, { req, api: "anthropic" });
                const headers = new Headers(sent?.headers);
                const supported = ["anthropic", "claude-code", "anthropic-oauth"].includes(provider);
                expect(headers.get("anthropic-beta")).toBe(chained ? (supported ? "compact-2026-09-04" : null) : (supported ? "oauth-host,compact-2026-09-04" : "oauth-host"));
                expect(headers.get("authorization")).toBe(`Bearer ${chained ? "next" : "host"}-token`);
                expect(headers.get("x-api-key")).toBeNull();
                expect(headers.get("user-agent")).toBe(chained ? null : "host-agent");
                expect(headers.get("x-app")).toBe(chained ? null : "host-app");
                expect(JSON.parse(String(sent?.body))).toEqual({ ...payload, model: chained ? model : "claude-test" });
                expect(await res.json()).toEqual({ content: [block] });
            } finally { globalThis.fetch = original; }
        });
    }
});
