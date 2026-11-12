import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import api from "./api";

type Seen = { stream: number; compact: number; fetch: number };

function provider(seen: Seen, extra: Partial<types.models.ProviderDefinition> = {}): types.models.ProviderDefinition {
    return {
        id: "acme", label: "Acme",
        fields: [{ key: "apiKey", label: "API key", type: "secret" }],
        transports: ["direct"],
        test: async () => ({ status: "available", reason: "ok", message: "ok", checkedAt: Date.now() }),
        listModels: async () => [{ id: "m1" }, { id: "m2" }],
        stream: async (_ctx, conn, req) => { seen.stream++; await conn.fetch("https://api.example/x").catch(() => undefined); req.onEvent?.({ type: "text_delta", delta: "hi" }); return { text: "hi " + req.model, thinking: "", finishReason: "stop", usage: {}, toolCalls: [] }; },
        compact: async (_ctx, _conn, req) => { seen.compact++; return { item: { type: "compaction", encrypted_content: "enc-" + req.model }, responseId: "r1", usage: { prompt_tokens: 1, completion_tokens: 1 } }; },
        ...extra,
    };
}

async function setup(extra: Partial<types.models.ProviderDefinition> = {}) {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") } });
    const seen: Seen = { stream: 0, compact: 0, fetch: 0 };
    ctx.state.models ??= {};
    ctx.state.models.providers = { acme: { owner: "core", module: "models", rel: "models/$modelProvider_acme.ts", definition: provider(seen, extra) } };
    ctx.state.models.health = {};
    ctx.state.registry.models.fetch = async () => { seen.fetch++; return new Response("{}"); };
    const conn = await ctx.fns.models.create({ provider: "acme", accountName: "work", config: {}, secrets: {} });
    return { ctx, seen, conn };
}

beforeAll(async () => { await mkTestCtx(); }, 60000);

const req = (connectionId: string, model: string) => ({ connectionId, model, instructions: "be brief", messages: [{ role: "user", content: "hi" }], sessionId: "s1" });

describe("models.setModelEnabled", () => {
    test("disables idempotently, keeps the model listed and re-enables", async () => {
        const { ctx, conn } = await setup();
        await ctx.fns.models.setModelEnabled({ id: conn.id, model: "m2", enabled: false });
        const twice = await ctx.fns.models.setModelEnabled({ id: conn.id, model: "m2", enabled: false });
        expect(twice.disabledModels).toEqual(["m2"]);
        expect(twice.updatedAt).toBeGreaterThan(conn.updatedAt);
        const listed = await ctx.fns.models.listModels({ id: conn.id });
        expect(listed.models).toEqual([{ id: "m1", disabled: false }, { id: "m2", disabled: true }]);
        const back = await ctx.fns.models.setModelEnabled({ id: conn.id, model: "m2", enabled: true });
        expect(back.disabledModels).toEqual([]);
        expect((await ctx.fns.models.listModels({ id: conn.id })).models.every((m: types.models.ModelInfo) => m.disabled === false)).toBe(true);
    });

    test("rejects invalid model ids and unknown connections", async () => {
        const { ctx, conn } = await setup();
        for (const model of ["", "a b", "x".repeat(201)]) await expect(ctx.fns.models.setModelEnabled({ id: conn.id, model, enabled: false })).rejects.toMatchObject({ code: "VALIDATION", field: "model" });
        await expect(ctx.fns.models.setModelEnabled({ id: crypto.randomUUID(), model: "m1", enabled: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect((await ctx.fns.models.get({ id: conn.id })).disabledModels).toEqual([]);
    });
});

describe("models.stream / models.compact enforcement", () => {
    test("a session using a model fails on its next request after disabling, with no provider call", async () => {
        const { ctx, seen, conn } = await setup();
        const events: unknown[] = [];
        expect((await ctx.fns.models.stream({ ...req(conn.id, "m1"), onEvent: (e: types.models.StreamEvent) => events.push(e) })).text).toBe("hi m1");
        expect(events).toEqual([{ type: "text_delta", delta: "hi" }]);
        expect(seen).toEqual({ stream: 1, compact: 0, fetch: 1 });
        await ctx.fns.models.setModelEnabled({ id: conn.id, model: "m1", enabled: false });
        await expect(ctx.fns.models.stream(req(conn.id, "m1"))).rejects.toMatchObject({ message: "Model m1 is disabled by user", code: "MODEL_DISABLED_BY_USER", retryable: false, replaySafe: false });
        await expect(ctx.fns.models.compact(req(conn.id, "m1"))).rejects.toMatchObject({ code: "MODEL_DISABLED_BY_USER" });
        expect(seen).toEqual({ stream: 1, compact: 0, fetch: 1 });
        expect((await ctx.fns.models.stream(req(conn.id, "m2"))).text).toBe("hi m2");
        await ctx.fns.models.setModelEnabled({ id: conn.id, model: "m1", enabled: true });
        expect((await ctx.fns.models.compact(req(conn.id, "m1"))).item).toMatchObject({ encrypted_content: "enc-m1" });
    });

    test("passes cache boundaries and compaction guidance unchanged", async () => {
        let streamed: types.models.StreamRequest | undefined;
        let compacted: types.models.CompactRequest | undefined;
        const { ctx, conn } = await setup({
            stream: async (_ctx, _conn, request) => {
                streamed = request;
                return { text: "", thinking: "", finishReason: "stop", usage: { cache_write_tokens: 17 }, toolCalls: [] };
            },
            compact: async (_ctx, _conn, request) => {
                compacted = request;
                return { item: { type: "compaction", content: "checkpoint", signature: "sig" }, responseId: "", usage: { prompt_tokens: 2, completion_tokens: 1 } };
            },
        });
        const result = await ctx.fns.models.stream({ ...req(conn.id, "m1"), cacheableMessageCount: 0 });
        expect(streamed?.cacheableMessageCount).toBe(0);
        expect(result.usage.cache_write_tokens).toBe(17);
        const compact = await ctx.fns.models.compact({ ...req(conn.id, "m1"), focus: "Preserve decisions", maxTokens: 1234 });
        expect(compacted?.focus).toBe("Preserve decisions");
        expect(compacted?.maxTokens).toBe(1234);
        expect(compact.item).toEqual({ type: "compaction", content: "checkpoint", signature: "sig" });
    });

    test("disabled connection and unsupported provider never reach the network", async () => {
        const { ctx, seen, conn } = await setup();
        await ctx.fns.models.update({ id: conn.id, enabled: false });
        await expect(ctx.fns.models.stream(req(conn.id, "m1"))).rejects.toMatchObject({ code: "CONNECTION_DISABLED", retryable: false });
        const bare = await setup({ stream: undefined, compact: undefined });
        await expect(bare.ctx.fns.models.stream(req(bare.conn.id, "m1"))).rejects.toMatchObject({ code: "UNSUPPORTED" });
        await expect(bare.ctx.fns.models.compact(req(bare.conn.id, "m1"))).rejects.toMatchObject({ code: "UNSUPPORTED" });
        expect(seen.fetch + bare.seen.fetch).toBe(0);
        expect(seen.stream + bare.seen.stream).toBe(0);
    });
});

describe("models.api setModelEnabled", () => {
    test("owner toggles a model; bad enabled is rejected", async () => {
        const { ctx, conn } = await setup();
        ctx.state.registry.auth.verifyCsrf = async (_c: unknown, _s: unknown, o: { token: string }) => o.token === "good";
        const owner = { user: { id: "u1", role: "owner" } } as unknown as Session;
        const member = { user: { id: "u2", role: "member" } } as unknown as Session;
        const post = (body: unknown, session: Session = owner) => api(ctx, session, { req: new Request("http://local/models/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-csrf-token": "good" } }) });
        expect((await post({ action: "setModelEnabled", id: conn.id, model: "m1", enabled: false }, member)).status).toBe(403);
        const res = await post({ action: "setModelEnabled", id: conn.id, model: "m1", enabled: false });
        expect(res.status).toBe(200);
        expect(((await res.json()) as { connection: types.models.ConnectionView }).connection.disabledModels).toEqual(["m1"]);
        expect((await post({ action: "setModelEnabled", id: conn.id, model: "m1", enabled: "no" })).status).toBe(400);
        expect((await post({ action: "setModelEnabled", id: conn.id, model: "bad id", enabled: true })).status).toBe(400);
    });
});
