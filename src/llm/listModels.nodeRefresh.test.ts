import { test, expect } from "bun:test";
import listModels from "./listModels";
import refresh from "../node/refresh";

// Exercise the actual refresh + catalogue path, without credentials or generation.
test("node choices survive transient refresh failures, but not revocation, disable or authoritative empty catalogues", async () => {
    const originalFetch = globalThis.fetch;
    let mode = "ok";
    const entries = ["su4imauz", "NylahKamalii9806"].map(account => ({ id: `codex/${account}:gpt-6-astra`, provider: "codex", account, api: "responses", kind: "subscription" }));
    const node: any = { name: "mini6", url: "http://node.test", enabled: true, catalog: entries, catalogAt: Date.now() - 600_000, lastError: null };
    const ctx: any = { env: { LMSTUDIO_URL: "http://local.test" }, fns: {
        settings: { get: async () => null },
        llm: { resolveEndpoint: async () => ({ apiKey: null }) },
        node: { get: async () => ({ ...node }), list: async () => [{ ...node }], token: async () => "test-only", refresh: (opts: any) => refresh(ctx, null, opts) },
        procs: { events: { refresh: () => {} }, db: { run: async ({ sql, params }: any) => {
            if (sql.includes("SET catalog =")) { node.catalog = JSON.parse(params[0]); node.catalogAt = params[1]; node.lastError = null; }
            else node.lastError = params[0];
        } } },
    } };
    globalThis.fetch = (async (input: any) => {
        if (!String(input).startsWith(node.url)) throw new Error("offline local");
        if (mode === "offline") throw new Error("connection refused");
        if (mode === "revoked") return new Response("denied", { status: 403 });
        return Response.json(String(input).endsWith("/models") ? { models: mode === "empty" ? [] : entries } : { usage: [] });
    }) as typeof fetch;
    try {
        const expected = entries.map(e => `hyper/mini6:${e.id}`);
        expect((await listModels(ctx, null))["hyper/mini6"]).toEqual(expected);
        mode = "offline"; node.catalogAt = Date.now() - 600_000;
        expect((await listModels(ctx, null))["hyper/mini6"]).toEqual(expected);
        node.enabled = false;
        expect((await listModels(ctx, null))["hyper/mini6"]).toBeUndefined();
        node.enabled = true; mode = "revoked";
        expect((await listModels(ctx, null))["hyper/mini6"]).toBeUndefined();
        mode = "offline";
        expect((await listModels(ctx, null))["hyper/mini6"]).toBeUndefined();
        mode = "ok";
        expect((await listModels(ctx, null))["hyper/mini6"]).toEqual(expected);
        node.catalogAt = Date.now() - 600_000; mode = "empty";
        expect((await listModels(ctx, null))["hyper/mini6"]).toBeUndefined();
    } finally { globalThis.fetch = originalFetch; }
});
