import { test, expect } from "bun:test";
import listModels from "../llm/listModels";
import catalog from "./catalog";
import relay from "./relay";

// Exercise the real discovery -> node catalogue -> relay boundary without any
// generation. An upstream call here would fail the test.
test("transient per-account discovery is retriable, not a false model denial", async () => {
    const original = globalThis.fetch;
    let mode: number | "timeout" | "empty" = 200;
    let connected = true;
    let allow = ["codex"];
    const state: any = {};
    const ctx: any = { env: {}, state, fns: {
        settings: { get: async () => [] },
        llm: {
            listAccounts: async () => connected ? [{ account: "named", source: "file" }] : [],
            resolveEndpoint: async ({ model }: { model: string }) => ({ apiKey: model.startsWith("codex/") ? "test" : null, api: "responses", kind: "subscription" }),
            accountCredentialExists: () => connected,
            refreshCodex: async () => connected ? "test" : null,
            codexCliVersion: async () => "1",
        },
        node: {
            list: async () => [],
            authorize: async () => ({ ok: true, client: { providers: allow, name: "client" }, hops: 0 }),
            upstream: async () => { throw new Error("must not generate"); },
        },
    } };
    ctx.fns.llm.listModels = (opts: any) => listModels(ctx, null, opts);
    ctx.fns.node.catalog = (opts: any) => catalog(ctx, null, opts);
    globalThis.fetch = (async (url: any) => {
        if (!String(url).includes("/codex/models")) throw new Error("offline test");
        if (mode === "timeout") throw new DOMException("secret must not be logged", "TimeoutError");
        if (mode === "empty") return Response.json({ models: [] });
        if (mode !== 200) return new Response("secret body must not be logged", { status: mode });
        return Response.json({ models: [{ slug: "gpt-test" }] });
    }) as typeof fetch;
    const rebuild = async () => { delete state.llmModelCatalog; return ctx.fns.node.catalog({ providers: allow }); };
    const request = (model = "codex/named:gpt-test", api = "responses") => relay(ctx, null, {
        req: new Request("http://node/responses", { method: "POST", body: JSON.stringify({ model }) }), api: api as "responses",
    });
    try {
        expect((await rebuild()).map((e: any) => e.id)).toContain("codex/named:gpt-test");
        for (const failure of ["timeout", 503, 429] as const) {
            mode = failure;
            expect(await rebuild()).toEqual([]);
            expect((await request()).status).toBe(503);
            expect((await request()).headers.get("retry-after")).toBe("5");
            expect((await request("codex/other:gpt-test")).status).toBe(404);
            expect((await request("codex/named:gpt-test", "openai")).status).toBe(404);
            allow = ["openai"];
            expect((await request()).status).toBe(404);
            allow = ["codex"];
            connected = false;
            expect((await request()).status).toBe(404);
            connected = true;
        }
        for (const definitive of [401, 403, "empty"] as const) {
            mode = definitive;
            await rebuild();
            expect((await request()).status).toBe(404);
        }
        mode = 503;
        await rebuild();
        state.llmModelCatalogFailures.skipNodes.at = Date.now() - 120_001;
        expect((await request()).status).toBe(404);
        mode = 200;
        expect((await rebuild()).map((e: any) => e.id)).toContain("codex/named:gpt-test");
        expect(state.llmModelCatalogFailures.skipNodes.codex).toEqual([]);
        connected = false;
        expect(await rebuild()).toEqual([]);
        expect((await request()).status).toBe(404);
    } finally { globalThis.fetch = original; }
});
