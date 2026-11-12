import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import provider from "./$modelProvider_custom";

beforeAll(async () => { await mkTestCtx(); }, 120000);

async function fixture(protocol = "openai-chat", suffix = "") {
    const requests: { path: string; headers: Headers; body: any; method: string }[] = [];
    const state = { modelsStatus: 200, generationStatus: 200, malformed: false };
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
        const path = new URL(req.url).pathname;
        requests.push({ path, headers: req.headers, body: req.method === "POST" ? await req.json() : null, method: req.method });
        if (req.method === "POST") return Response.json({}, { status: state.generationStatus });
        return Response.json(state.malformed ? {} : protocol === "gemini" ? { models: [{ name: "models/mock", displayName: "Mock" }] } : { data: [{ id: "mock" }] }, { status: state.modelsStatus });
    } });
    const ctx = await mkTestCtx();
    ctx.state.models ??= {};
    ctx.state.models.providers = { custom: { owner: "core", module: "models", rel: "models/$modelProvider_custom.ts", definition: provider } };
    const conn: types.models.ResolvedConnection = {
        id: "fixture", provider: "custom", accountName: "mock", config: { baseUrl: server.url.origin + suffix, protocol, testModel: "mock", models: ["manual", "mock"] },
        secret: async key => key === "apiKey" ? "test-only-key" : null,
        fetch: async (url, init) => await fetch(url, init),
    };
    return { ctx, conn, requests, state, server };
}

describe("custom protocol local HTTP requests", () => {
    for (const protocol of ["openai-chat", "openai-responses", "anthropic", "gemini"]) {
        test(protocol + " discovery, authentication and minimal generation", async () => {
            const f = await fixture(protocol, protocol.startsWith("openai") ? "/v1/" : "");
            try {
                expect(await f.ctx.fns.models.customProtocol({ conn: f.conn, operation: "models" })).toEqual([{ id: "mock" }]);
                await f.ctx.fns.models.customProtocol({ conn: f.conn, operation: "generation" });
                const [models, gen] = f.requests;
                expect(models!.path).toBe(protocol === "gemini" ? "/v1beta/models" : "/v1/models");
                expect(models!.method).toBe("GET");
                expect(gen!.method).toBe("POST");
                for (const r of f.requests) {
                    expect(r.headers.get("authorization")).toBe(protocol.startsWith("openai") ? "Bearer test-only-key" : null);
                    expect(r.headers.get("x-api-key")).toBe(protocol === "anthropic" ? "test-only-key" : null);
                    expect(r.headers.get("anthropic-version")).toBe(protocol === "anthropic" ? "2023-06-01" : null);
                    expect(r.headers.get("x-goog-api-key")).toBe(protocol === "gemini" ? "test-only-key" : null);
                }
                expect(gen!.path).toBe(({ "openai-chat": "/v1/chat/completions", "openai-responses": "/v1/responses", anthropic: "/v1/messages", gemini: "/v1beta/models/mock:generateContent" })[protocol]!);
                if (protocol === "gemini") { expect(gen!.body.generationConfig.maxOutputTokens).toBe(1); expect(gen!.body.contents[0].parts[0].text).toBe("Hi"); }
                else { expect(gen!.body.model).toBe("mock"); expect(gen!.body[protocol === "openai-responses" ? "max_output_tokens" : "max_tokens"]).toBe(1); expect(gen!.body.stream).toBe(false); }
                f.state.generationStatus = 401;
                expect((await provider.test(f.ctx, f.conn)).reason).toBe("generation-failed");
                f.state.modelsStatus = 500;
                expect((await provider.test(f.ctx, f.conn)).status).toBe("unavailable");
            } finally { f.server.stop(true); }
        });
    }
    test("versioned bases, optional keys and malformed discovery", async () => {
        for (const [protocol, suffix] of [["anthropic", "/v1/"], ["gemini", "/v1beta/"], ["gemini", "/v1/"]]) {
            const f = await fixture(protocol, suffix);
            try {
                f.conn.secret = async () => null;
                await f.ctx.fns.models.customProtocol({ conn: f.conn, operation: "models" });
                expect(f.requests[0]!.path).toBe(suffix + "models");
                expect(f.requests[0]!.headers.has("authorization")).toBe(false);
                expect(f.requests[0]!.headers.has("x-api-key")).toBe(false);
                expect(f.requests[0]!.headers.has("x-goog-api-key")).toBe(false);
                f.state.malformed = true;
                await expect(f.ctx.fns.models.customProtocol({ conn: f.conn, operation: "models" })).rejects.toThrow("catalogue");
            } finally { f.server.stop(true); }
        }
    });
});

describe("custom provider spec scenarios", () => {
    test("schema rejects unsupported protocol and invalid base URLs", async () => {
        const f = await fixture();
        try {
            await expect(f.ctx.fns.models.validateConfig({ provider: "custom", config: { baseUrl: "https://example.test", protocol: "other" } })).rejects.toThrow();
            for (const baseUrl of ["relative", "ftp://example.test", "https://u:p@example.test", "https://example.test?q=1", "https://example.test#hash", "https://example.test?", "https://example.test#"]) {
                await expect(f.ctx.fns.models.validateConfig({ provider: "custom", config: { baseUrl, protocol: "openai-chat" } })).rejects.toThrow();
            }
            expect(provider.transports).toEqual(["direct", "socks", "ssh-tunnel"]);
        } finally { f.server.stop(true); }
    });
    test("discovery merges manual ids, failure preserves them with error; no-model test and usage are status-only", async () => {
        const f = await fixture();
        try {
            const view = await f.ctx.fns.models.create({ provider: "custom", accountName: "test", config: { baseUrl: f.server.url.origin, protocol: "openai-chat", models: ["manual", "mock"] } });
            expect((await f.ctx.fns.models.listModels({ id: view.id })).models).toEqual([{ id: "mock", disabled: false }, { id: "manual", disabled: false }]);
            const status = await f.ctx.fns.models.test({ id: view.id });
            expect(status.status).toBe("available"); expect(status.reason).toBe("models-ok");
            const usage = await f.ctx.fns.models.usage({ id: view.id, refresh: true });
            expect(Object.keys(usage).sort()).toEqual(["checkedAt", "reason", "status"]);
            expect(usage.reason).toBe("models-ok");
            expect(f.requests.every(r => r.method === "GET")).toBe(true);
            f.state.modelsStatus = 503;
            const fallback = await f.ctx.fns.models.listModels({ id: view.id });
            expect(fallback.models).toEqual([{ id: "mock", disabled: false }, { id: "manual", disabled: false }]); expect(fallback.error).toBeFalsy(); expect(fallback.source).toBe("provider");
            const failed = await f.ctx.fns.models.listModels({ id: view.id, refresh: true });
            expect(failed.models).toEqual(fallback.models); expect(failed.error).toBeTruthy(); expect(failed.source).toBe("provider");
        } finally { f.server.stop(true); }
    });
    test("generation success and failure, models failure short-circuits generation", async () => {
        const f = await fixture();
        try {
            expect((await provider.test(f.ctx, f.conn)).reason).toBe("generation-ok");
            f.state.generationStatus = 500;
            expect(await provider.test(f.ctx, f.conn)).toMatchObject({ status: "unavailable", reason: "generation-failed" });
            f.state.modelsStatus = 500; f.requests.length = 0;
            expect((await provider.test(f.ctx, f.conn)).reason).toBe("models-failed");
            expect(f.requests).toHaveLength(1);
        } finally { f.server.stop(true); }
    });
    test("saved SOCKS connection sends discovery and generation through the selected proxy", async () => {
        const f = await fixture();
        try {
            const sent: any[] = [];
            const proxyId = "12345678-1234-4234-8234-123456789abc";
            await f.ctx.fns.procs.db.run({ sql: 'INSERT INTO socks_proxies(id,name,host,port,revision,created_at,updated_at) VALUES (?,?,?,?,1,?,?)', params: [proxyId, "custom-test-proxy", "127.0.0.1", 1080, Date.now(), Date.now()] });
            f.ctx.state.registry.socksProxy.validateIdentity = async () => {};
            f.ctx.state.registry.socksProxy.readSaved = async (_c: any, _s: any, opts: any) => { expect(opts.id).toBe(proxyId); return { host: "127.0.0.1", port: 1080 }; };
            f.ctx.state.registry.socksProxy.request = async (_c: any, _s: any, opts: any) => { sent.push(opts); return Response.json(opts.method === "POST" ? {} : { data: [{ id: "mock" }] }); };
            const view = await f.ctx.fns.models.create({ provider: "custom", accountName: "proxy", config: { baseUrl: "https://example.invalid/v1", protocol: "openai-chat", testModel: "mock" }, transport: { kind: "socks", proxyId } });
            expect(view.transport).toEqual({ kind: "socks", proxyId });
            expect((await f.ctx.fns.models.test({ id: view.id })).status).toBe("available");
            expect(sent).toHaveLength(2);
            expect(sent.every(r => r.proxy.host === "127.0.0.1" && r.proxy.port === 1080)).toBe(true);
            expect(sent.map(r => r.method)).toEqual(["GET", "POST"]);
            expect(f.requests).toHaveLength(0);
        } finally { f.server.stop(true); }
    });
    test("provider uses only connection-bound fetch without direct fallback", async () => {
        const f = await fixture();
        try {
            let calls = 0;
            f.conn.fetch = async () => { calls++; throw new Error("transport unavailable"); };
            expect((await provider.test(f.ctx, f.conn)).status).toBe("unavailable");
            expect(calls).toBe(1); expect(f.requests).toHaveLength(0);
        } finally { f.server.stop(true); }
    });
});
