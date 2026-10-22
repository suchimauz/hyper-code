import { describe, expect, test } from "bun:test";
import modelPolicy from "./modelPolicy";
import resolveEndpoint from "./resolveEndpoint";
import call from "./call";
import listModels from "./listModels";
import relay from "../node/relay";

// Offline storage double: every mutation is one SQL statement scoped to one key.
function fixture() {
    const kv = new Map<string, string>();
    const writes: Array<{ sql: string; params: any[] }> = [];
    const refreshes: string[] = [];
    let credentials = 0;
    let fallbacks = 0;
    const ctx: any = { fns: {
        procs: {
            db: {
                select: async () => [...kv].filter(([key, value]) => key.startsWith("llm:model-disabled:") && value === "true").map(([key]) => ({ key })),
                run: async (opts: { sql: string; params: any[] }) => {
                    writes.push(opts);
                    if (opts.sql.startsWith("INSERT")) kv.set(opts.params[0], opts.params[1]);
                    else if (opts.sql.startsWith("DELETE")) kv.delete(opts.params[0]);
                    else throw new Error("Unexpected mutation");
                },
            },
            events: { refresh: async ({ topic }: { topic: string }) => { refreshes.push(topic); } },
        },
        settings: {
            getString: async () => { fallbacks++; return "mock:fallback"; },
            get: async () => { credentials++; throw new Error("Credentials must not be accessed"); },
        },
        secrets: { resolveSetting: async () => { credentials++; throw new Error("Credentials must not be accessed"); } },
        llm: {},
    } };
    ctx.fns.llm.modelPolicy = (opts: any) => modelPolicy(ctx, null, opts);
    ctx.fns.llm.resolveEndpoint = (opts: any) => resolveEndpoint(ctx, null, opts);
    return { ctx, kv, writes, refreshes, counters: () => ({ credentials, fallbacks }) };
}

describe("llm.modelPolicy", () => {
    test("node relay blocks exact local and chained routes before credential or network dispatch", async () => {
        for (const chained of [false, true]) {
            const { ctx } = fixture();
            const entry = { id: "codex/work:gpt-test", api: "responses", provider: "codex", account: "work", kind: "subscription", ...(chained ? { via: "hyper/next" } : {}) };
            const model = chained ? "hyper/next:codex/work:gpt-test" : "codex/work:gpt-test";
            await modelPolicy(ctx, null, { action: "set", model, disabled: true });
            let dispatches = 0;
            ctx.fns.node = {
                authorize: async () => ({ ok: true, client: { name: "test", providers: [] }, hops: 0 }),
                catalog: async () => [entry],
                upstream: async () => { dispatches++; throw new Error("no credentials allowed"); },
                get: async () => { dispatches++; throw new Error("no node lookup allowed"); },
            };
            const response = await relay(ctx, null, { req: new Request("http://localhost/node/responses", { method: "POST", body: JSON.stringify({ model: entry.id }) }), api: "responses" });
            expect(response.status).toBe(403);
            expect(await response.json()).toEqual({ error: "Model is disabled by user: " + model, code: "MODEL_DISABLED_BY_USER" });
            expect(dispatches).toBe(0);
        }
    });
    test("disabled curated and Groq probe models remain discoverable without an inference bypass", async () => {
        const { ctx } = fixture();
        ctx.env = { LMSTUDIO_URL: "http://127.0.0.1:9" };
        ctx.fns.settings.get = async () => [];
        ctx.fns.llm.gatewayHealth = async () => ({ models: [], status: "unknown" });
        ctx.fns.llm.accountCredentialExists = () => true;
        ctx.fns.secrets.resolveSetting = async () => "offline-key";
        const routes = ["kimi:kimi-k3", "kimi-coding:k3", "openai:gpt-5-codex", "openrouter:anthropic/claude-sonnet-4.6", "groq:openai/gpt-oss-120b"];
        for (const model of routes) await modelPolicy(ctx, null, { action: "set", model, disabled: true });
        const originalFetch = globalThis.fetch;
        let catalogueRequests = 0;
        globalThis.fetch = (async (url: string | URL | Request) => {
            if (String(url) === "https://api.groq.com/openai/v1/models") {
                catalogueRequests++;
                return Response.json({ data: [{ id: "openai/gpt-oss-120b", active: true }] });
            }
            throw new Error("offline test: no external network");
        }) as typeof fetch;
        try {
            const groups = await listModels(ctx, null);
            for (const model of routes) expect(Object.values(groups).flat()).toContain(model);
            expect(catalogueRequests).toBe(1);
            await expect(resolveEndpoint(ctx, null, { model: routes[0]! })).rejects.toMatchObject({ code: "MODEL_DISABLED_BY_USER" });
        } finally { globalThis.fetch = originalFetch; }
    });
    test("lists persistent true keys and ignores other values and namespaces", async () => {
        const { ctx, kv } = fixture();
        kv.set("other", "true");
        kv.set("llm:model-disabled:" + encodeURIComponent("mock:b"), "false");
        kv.set("llm:model-disabled:" + encodeURIComponent("mock:a"), "true");
        expect(await modelPolicy(ctx, null, { action: "list" })).toEqual({ disabledModels: ["mock:a"] });
    });

    test("default account aliases share a canonical key and each set is an isolated atomic write", async () => {
        const { ctx, writes, refreshes } = fixture();
        await modelPolicy(ctx, null, { action: "set", model: "codex/default:gpt-test", disabled: true });
        expect(writes).toHaveLength(1);
        expect(writes[0]!.sql).toContain("ON CONFLICT (key) DO UPDATE");
        expect(writes[0]!.params).toEqual(["llm:model-disabled:" + encodeURIComponent("codex:gpt-test"), "true"]);
        expect(await modelPolicy(ctx, null, { action: "list" })).toEqual({ disabledModels: ["codex:gpt-test"] });
        await expect(modelPolicy(ctx, null, { action: "assert", model: "codex:gpt-test" })).rejects.toMatchObject({
            message: "Model is disabled by user: codex:gpt-test", code: "MODEL_DISABLED_BY_USER", retryable: false, replaySafe: false,
        });
        await modelPolicy(ctx, null, { action: "set", model: "codex:gpt-test", disabled: false });
        expect(writes).toHaveLength(2);
        expect(writes[1]!.sql).toBe("DELETE FROM kv WHERE key = ?");
        expect(await modelPolicy(ctx, null, { action: "assert", model: "codex/default:gpt-test" })).toEqual({ disabledModels: [] });
        expect(refreshes).toEqual(["llm-accounts", "llm-models", "llm-accounts", "llm-models"]);
    });

    test("named accounts, SSH and node identities remain distinct", async () => {
        const { ctx } = fixture();
        const routes = ["codex/work:m", "ssh/box:codex/default:m", "hyper/default:codex:m", "hyper/node:codex/work:m"];
        await Promise.all(routes.map(model => modelPolicy(ctx, null, { action: "set", model, disabled: true })));
        expect((await modelPolicy(ctx, null, { action: "list" })).disabledModels).toEqual([...routes].sort());
        for (const model of ["codex:m", "codex/personal:m", "ssh/other:codex/default:m", "hyper/other:codex/work:m"]) {
            await modelPolicy(ctx, null, { action: "assert", model });
        }
        for (const model of routes) await expect(modelPolicy(ctx, null, { action: "assert", model })).rejects.toMatchObject({ code: "MODEL_DISABLED_BY_USER" });
    });

    test("bare local model is equivalent to lmstudio/default", async () => {
        const { ctx } = fixture();
        expect(await modelPolicy(ctx, null, { action: "set", model: "local-model", disabled: true })).toEqual({ disabledModels: ["lmstudio:local-model"] });
        await expect(modelPolicy(ctx, null, { action: "assert", model: "lmstudio/default:local-model" })).rejects.toMatchObject({ code: "MODEL_DISABLED_BY_USER" });
    });

    test("invalid routes and nonboolean set flags never write", async () => {
        const { ctx, writes } = fixture();
        for (const model of [undefined, "", " ", "codex:", ":m", "a b", "codex/../:m", "ssh/bad:codex:m"]) {
            await expect(modelPolicy(ctx, null, { action: "set", model, disabled: true })).rejects.toThrow("Invalid model route");
        }
        for (const disabled of [undefined, null, "false", 1]) {
            await expect(modelPolicy(ctx, null, { action: "set", model: "mock:m", disabled } as any)).rejects.toThrow("disabled must be a boolean");
        }
        expect(writes).toHaveLength(0);
    });

    test("endpoint guard blocks credential resolution and node/SSH lookup", async () => {
        const { ctx, counters } = fixture();
        for (const model of ["openai:m", "ssh/box:codex/default:m", "hyper/node:codex:m"]) {
            await modelPolicy(ctx, null, { action: "set", model, disabled: true });
            await expect(resolveEndpoint(ctx, null, { model })).rejects.toMatchObject({ code: "MODEL_DISABLED_BY_USER" });
        }
        expect(counters()).toEqual({ credentials: 0, fallbacks: 0 });
    });

    test("call primary guard rejects before fallback configuration or endpoint/network", async () => {
        const { ctx, counters } = fixture();
        await modelPolicy(ctx, null, { action: "set", model: "openai:m", disabled: true });
        ctx.fns.llm.resolveEndpoint = async () => { throw new Error("Must not resolve endpoint"); };
        await expect(call(ctx, null, { user: "offline", model: "openai:m" })).rejects.toMatchObject({ code: "MODEL_DISABLED_BY_USER" });
        expect(counters()).toEqual({ credentials: 0, fallbacks: 0 });
    });

    test("disabled code alone never retries or falls back", async () => {
        const { ctx } = fixture();
        let endpoints = 0;
        ctx.fns.llm.resolveEndpoint = async () => {
            endpoints++;
            throw Object.assign(new Error("network 503"), { code: "MODEL_DISABLED_BY_USER" });
        };
        await expect(call(ctx, null, { user: "offline", model: "mock:m" })).rejects.toMatchObject({ code: "MODEL_DISABLED_BY_USER" });
        expect(endpoints).toBe(1);
    });
});
