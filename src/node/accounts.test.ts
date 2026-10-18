import { describe, test, expect } from "bun:test";
import catalog from "./catalog";
import relay from "./relay";

const entry = (account: string, provider = "codex") => ({ id: `${provider}/${account}:gpt-test`, provider, account, api: "responses" as const, kind: "subscription" as const });

describe("node credential identity", () => {
    test("catalog preserves provider/account and filters providers before exposing entries", async () => {
        const ctx = { fns: { llm: {
            listModels: async () => ({ codex: ["codex/first:gpt-test", "codex/second:gpt-test", "codex/first:gpt-test"], openai: ["openai:gpt-test"] }),
            resolveEndpoint: async () => ({ api: "responses", kind: "subscription" }),
        }, node: { list: async () => [] } } } as unknown as Context;
        expect((await catalog(ctx, null, { providers: ["codex"] })).map(e => e.id)).toEqual(["codex/first:gpt-test", "codex/second:gpt-test"]);
        expect((await catalog(ctx, null, {})).map(e => e.id)).toContain("openai/default:gpt-test");
    });

    test("relay uses selected credential, strips routing prefix, and refuses ambiguous or forbidden IDs", async () => {
        const original = globalThis.fetch;
        const sent: Array<{ body: Record<string, unknown>; url: string }> = [];
        const accounts: string[] = [];
        let entries = [entry("first"), entry("second")];
        const ctx = { fns: { node: {
            authorize: async () => ({ ok: true, client: { providers: ["codex"], name: "client" }, hops: 0 }),
            catalog: async () => entries,
            upstream: async (opts: { account: string }) => { accounts.push(opts.account); return { url: "http://upstream", headers: {} }; },
        }, procs: { log: { info: () => {} } } } } as unknown as Context;
        globalThis.fetch = (async (url, opts) => { sent.push({ url: String(url), body: JSON.parse(String(opts?.body)) }); return new Response("ok"); }) as typeof fetch;
        const request = (model: string) => relay(ctx, null, { req: new Request("http://node/responses", { method: "POST", body: JSON.stringify({ model, input: "untouched", stream: true }) }), api: "responses" });
        try {
            for (const account of ["first", "second"]) expect((await request(`codex/${account}:gpt-test`)).status).toBe(200);
            expect(accounts).toEqual(["first", "second"]);
            expect(sent.map(s => s.body)).toEqual([0, 1].map(() => ({ model: "gpt-test", input: "untouched", stream: true })));
            expect((await request("gpt-test")).status).toBe(404);
            expect((await request("openai/default:gpt-test")).status).toBe(404);
            expect(accounts).toHaveLength(2);
            entries = [entry("first")];
            expect((await request("gpt-test")).status).toBe(200);
            expect(accounts.at(-1)).toBe("first");
            entries = [{ ...entry("default"), id: "gpt-test" }];
            expect((await request("gpt-test")).status).toBe(200);
            expect(sent.at(-1)?.body.model).toBe("gpt-test");
        } finally { globalThis.fetch = original; }
    });

    test("chaining keeps the qualified account ID and uses chat route", async () => {
        const original = globalThis.fetch;
        let sent: { url: string; body: string } | undefined;
        const ctx = { fns: { node: {
            authorize: async () => ({ ok: true, client: { providers: ["openai"], name: "client" }, hops: 0 }),
            catalog: async () => [{ ...entry("second", "openai"), api: "openai", via: "hyper/next" }],
            get: async () => ({ url: "http://next/v1" }), token: async () => "test-token",
        }, procs: { log: { info: () => {} } } } } as unknown as Context;
        globalThis.fetch = (async (url, opts) => { sent = { url: String(url), body: String(opts?.body) }; return new Response("ok"); }) as typeof fetch;
        try {
            const res = await relay(ctx, null, { req: new Request("http://node/chat", { method: "POST", body: JSON.stringify({ model: "gpt-test" }) }), api: "openai" });
            expect(res.status).toBe(200);
            expect(sent?.url).toBe("http://next/v1/chat");
            expect(JSON.parse(sent!.body).model).toBe("openai/second:gpt-test");
        } finally { globalThis.fetch = original; }
    });
});
