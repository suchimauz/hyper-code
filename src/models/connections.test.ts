import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import api from "./api";

const KEY = "sk-live-SUPERSECRET-0123456789abcdef";
const ORG = "org-secret-value-42";

type Calls = { test: number; usage: number; listModels: number; action: number };

function provider(calls: Calls, extra: Partial<types.models.ProviderDefinition> = {}): types.models.ProviderDefinition {
    return {
        id: "acme", label: "Acme",
        fields: [
            { key: "baseUrl", label: "Base URL", type: "url", required: true },
            { key: "protocol", label: "Protocol", type: "select", default: "chat", options: [{ value: "chat", label: "Chat" }, { value: "responses", label: "Responses" }] },
            { key: "apiKey", label: "API key", type: "secret", required: true },
            { key: "org", label: "Organization", type: "secret" },
            { key: "limit", label: "Limit", type: "number" },
            { key: "beta", label: "Beta", type: "boolean", default: false },
        ],
        transports: ["direct", "socks"],
        validate: (_ctx, config) => { if (String(config.baseUrl).includes("forbidden")) throw new Error("forbidden host"); },
        test: async (_ctx, conn) => { calls.test++; const key = await conn.secret("apiKey"); if (conn.config.baseUrl === "https://fail.example") throw new Error(`401 for key ${key}`); return { status: "available", reason: "models-ok", message: "ok", checkedAt: 1 }; },
        actions: { echo: { label: "Echo", run: async (_ctx, conn, input) => { calls.action++; return input === "leak" ? { token: await conn.secret("apiKey") } : { got: input }; } } },
        ...extra,
    };
}

async function setup(extra: Partial<types.models.ProviderDefinition> = {}) {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 21).toString("base64") } });
    const calls: Calls = { test: 0, usage: 0, listModels: 0, action: 0 };
    ctx.state.models ??= {};
    ctx.state.models.providers = { acme: { owner: "core", module: "models", rel: "models/$modelProvider_acme.ts", definition: provider(calls, extra) } };
    ctx.state.models.health = {};
    const create = (over: Record<string, unknown> = {}) => ctx.fns.models.create({ provider: "acme", accountName: "work", config: { baseUrl: "https://api.example" }, secrets: { apiKey: KEY }, ...over });
    const secretRows = async (id: string) => (await ctx.fns.procs.db.select({ sql: "SELECT name FROM local_secrets WHERE namespace='models' AND starts_with(name, ?) ORDER BY name", params: [`${id}.`] })).map((r: any) => r.name);
    return { ctx, calls, create, secretRows };
}

// The first test context builds the migrated template database; keep that out of per-test timeouts.
beforeAll(async () => { await mkTestCtx(); }, 60000);

const noSecrets = (value: unknown) => { const json = JSON.stringify(value); expect(json).not.toContain(KEY); expect(json).not.toContain(ORG); expect(json).not.toContain("secret://"); };

describe("models.validateConfig", () => {
    test("missing required, unknown key, bad select, bad url, provider validate", async () => {
        const { ctx } = await setup();
        const v = (config: Record<string, unknown>, secrets: Record<string, unknown> = { apiKey: KEY }) => ctx.fns.models.validateConfig({ provider: "acme", config, secrets });
        await expect(v({})).rejects.toMatchObject({ code: "VALIDATION", field: "baseUrl" });
        await expect(v({ baseUrl: "https://a.example" }, {})).rejects.toMatchObject({ field: "apiKey" });
        await expect(v({ baseUrl: "https://a.example", nope: 1 })).rejects.toMatchObject({ field: "nope" });
        await expect(v({ baseUrl: "https://a.example", protocol: "gemini" })).rejects.toMatchObject({ field: "protocol" });
        for (const baseUrl of ["not a url", "ftp://a.example", "https://u:p@a.example"]) await expect(v({ baseUrl })).rejects.toMatchObject({ field: "baseUrl" });
        await expect(v({ baseUrl: "https://a.example", limit: "5" })).rejects.toMatchObject({ field: "limit" });
        await expect(v({ baseUrl: "https://a.example", apiKey: KEY })).rejects.toMatchObject({ field: "apiKey" });
        await expect(v({ baseUrl: "https://forbidden.example" })).rejects.toThrow("forbidden host");
        await expect(ctx.fns.models.validateConfig({ provider: "nope", config: {} })).rejects.toMatchObject({ code: "UNKNOWN_PROVIDER" });
        expect(await v({ baseUrl: "https://a.example", models: ["m1", "m1", " m2 "] })).toEqual({ config: { baseUrl: "https://a.example", protocol: "chat", beta: false, models: ["m1", "m2"] }, secrets: { apiKey: KEY } });
    });
});

describe("models connection CRUD", () => {
    test("create/list/get never expose secrets; names are not unique", async () => {
        const { ctx, create, secretRows } = await setup();
        const a = await create({ secrets: { apiKey: KEY, org: ORG } });
        const b = await create();
        expect(a.id).not.toBe(b.id);
        expect(a).toMatchObject({ provider: "acme", accountName: "work", enabled: true, transport: { kind: "direct" }, secrets: { apiKey: true, org: true }, providerRegistered: true });
        expect(b.secrets).toEqual({ apiKey: true, org: false });
        const list = await ctx.fns.models.list({});
        expect(list.map((c: any) => c.id)).toEqual([a.id, b.id]);
        noSecrets(list); noSecrets(await ctx.fns.models.get({ id: a.id }));
        const [row] = await ctx.fns.procs.db.select({ sql: "SELECT config::text AS c FROM llm_connections WHERE id=?", params: [a.id] });
        expect(row.c).not.toContain(KEY);
        expect(await secretRows(a.id)).toEqual([`${a.id}.apiKey`, `${a.id}.org`]);
        expect(await ctx.fns.secrets.getLocal({ namespace: "models", name: `${a.id}.apiKey` })).toBe(KEY);
    });

    test("blank or long account name, unknown provider and disallowed transport store nothing", async () => {
        const { ctx, create } = await setup();
        await expect(create({ accountName: "  " })).rejects.toMatchObject({ field: "accountName" });
        await expect(create({ accountName: "x".repeat(101) })).rejects.toMatchObject({ field: "accountName" });
        await expect(create({ provider: "ghost" })).rejects.toMatchObject({ code: "UNKNOWN_PROVIDER" });
        await expect(create({ transport: { kind: "ssh-tunnel", instance: "box" } })).rejects.toMatchObject({ field: "transport" });
        await expect(create({ transport: { kind: "socks", proxyId: "00000000-0000-4000-8000-000000000000" } })).rejects.toMatchObject({ field: "transport" });
        expect(await ctx.fns.models.list({})).toEqual([]);
        expect((await ctx.fns.procs.db.select({ sql: "SELECT count(*)::int AS n FROM local_secrets WHERE namespace='models'", params: [] }))[0].n).toBe(0);
    });

    test("update keeps omitted secrets, replaces given ones, clears null, refuses clearing required", async () => {
        const { ctx, create, secretRows } = await setup();
        const a = await create({ secrets: { apiKey: KEY, org: ORG } });
        const renamed = await ctx.fns.models.update({ id: a.id, accountName: "home", config: { baseUrl: "https://other.example", limit: 3 } });
        expect(renamed).toMatchObject({ accountName: "home", config: { baseUrl: "https://other.example", limit: 3 }, secrets: { apiKey: true, org: true } });
        expect(renamed.updatedAt).toBeGreaterThan(a.updatedAt);
        expect(await ctx.fns.secrets.getLocal({ namespace: "models", name: `${a.id}.apiKey` })).toBe(KEY);
        const cleared = await ctx.fns.models.update({ id: a.id, secrets: { org: null, apiKey: "new-key-value" } });
        expect(cleared.secrets).toEqual({ apiKey: true, org: false });
        expect(await secretRows(a.id)).toEqual([`${a.id}.apiKey`]);
        expect(await ctx.fns.secrets.getLocal({ namespace: "models", name: `${a.id}.apiKey` })).toBe("new-key-value");
        await expect(ctx.fns.models.update({ id: a.id, secrets: { apiKey: null } })).rejects.toMatchObject({ field: "apiKey" });
        expect((await ctx.fns.models.update({ id: a.id, enabled: false })).enabled).toBe(false);
        await expect(ctx.fns.models.update({ id: crypto.randomUUID(), enabled: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    test("remove deletes the row and all its secrets only", async () => {
        const { ctx, create, secretRows } = await setup();
        const a = await create({ secrets: { apiKey: KEY, org: ORG } });
        const b = await create();
        expect(await ctx.fns.models.remove({ id: a.id })).toEqual({ removed: a.id });
        expect((await ctx.fns.models.list({})).map((c: any) => c.id)).toEqual([b.id]);
        expect(await secretRows(a.id)).toEqual([]);
        expect(await secretRows(b.id)).toEqual([`${b.id}.apiKey`]);
        await expect(ctx.fns.models.get({ id: a.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(ctx.fns.models.remove({ id: a.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
});

describe("models test/listModels/usage/action", () => {
    test("test: disabled makes no provider call; failure is unavailable without secret", async () => {
        const { ctx, calls, create } = await setup();
        const off = await create({ enabled: false });
        expect(await ctx.fns.models.test({ id: off.id })).toMatchObject({ status: "disabled", reason: "disabled" });
        expect(calls.test).toBe(0);
        const bad = await create({ config: { baseUrl: "https://fail.example" } });
        const r = await ctx.fns.models.test({ id: bad.id });
        expect(r).toMatchObject({ status: "unavailable", reason: "test-failed" });
        expect(r.message).toContain("401");
        noSecrets(r);
        const good = await create();
        expect(await ctx.fns.models.test({ id: good.id })).toMatchObject({ status: "available", reason: "models-ok" });
    });

    test("usage fallback is status-only and reuses the cached test; update invalidates", async () => {
        const { ctx, calls, create } = await setup();
        const c = await create();
        const first = await ctx.fns.models.usage({ id: c.id });
        expect(Object.keys(first).sort()).toEqual(["checkedAt", "reason", "status"]);
        expect(first).toMatchObject({ status: "available", reason: "models-ok" });
        await ctx.fns.models.usage({ id: c.id });
        expect(calls.test).toBe(1);
        await Promise.all([ctx.fns.models.test({ id: c.id }), ctx.fns.models.test({ id: c.id })]);
        expect(calls.test).toBe(2);
        await ctx.fns.models.update({ id: c.id, accountName: "renamed" });
        await ctx.fns.models.usage({ id: c.id });
        expect(calls.test).toBe(3);
        const off = await ctx.fns.models.update({ id: c.id, enabled: false });
        expect(await ctx.fns.models.usage({ id: off.id })).toMatchObject({ status: "disabled" });
        expect(calls.test).toBe(3);
    });

    test("provider usage is normalized and cached", async () => {
        let n = 0;
        const { ctx, create } = await setup({ usage: async () => { n++; return { status: "available", checkedAt: 0, windows: [{ label: "5h", usedPercent: 140, resetAt: 5 }], balance: { amount: 3, currency: "USD" } }; } });
        const c = await create();
        const u = await ctx.fns.models.usage({ id: c.id });
        expect(u).toMatchObject({ status: "available", windows: [{ label: "5h", usedPercent: 100, resetAt: 5 }], balance: { amount: 3, currency: "USD" } });
        await ctx.fns.models.usage({ id: c.id });
        expect(n).toBe(1);
        await ctx.fns.models.usage({ id: c.id, refresh: true });
        expect(n).toBe(2);
    });

    test("listModels: provider list, manual fallback on failure, manual without provider", async () => {
        let fail = false;
        let discovered = 0;
        const { ctx, create } = await setup({ listModels: async () => { discovered++; if (fail) throw new Error(`boom ${KEY}`); return [{ id: "a" }, { id: "a" }, { id: "b", label: "B", contextWindow: 1000 }]; } });
        const c = await create({ config: { baseUrl: "https://api.example", models: ["manual-1"] } });
        const first = await ctx.fns.models.listModels({ id: c.id });
        expect(first).toEqual({ models: [{ id: "a", disabled: false }, { id: "b", label: "B", contextWindow: 1000, disabled: false }], source: "provider", cachedAt: expect.any(Number) });
        // Cached: no provider call without refresh, and the cache never expires.
        const n = discovered;
        expect(await ctx.fns.models.listModels({ id: c.id })).toEqual(first);
        expect(discovered).toBe(n);
        fail = true;
        const r = await ctx.fns.models.listModels({ id: c.id, refresh: true });
        expect(discovered).toBe(n + 1);
        expect(r).toMatchObject({ models: first.models, source: "provider", cachedAt: first.cachedAt });
        expect(r.error).toBeTruthy();
        noSecrets(r);
        // refreshAll reports the failure and keeps the cache.
        const all = await ctx.fns.models.refreshAll({});
        expect(all.refreshed).toBe(0); expect(all.failed.map((x: { id: string }) => x.id)).toEqual([c.id]);
        noSecrets(all);
        fail = false;
        expect(await ctx.fns.models.refreshAll({})).toEqual({ refreshed: 1, failed: [] });
        await ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET models_cache=NULL, models_cached_at=NULL WHERE id=?", params: [c.id] });
        fail = true;
        expect(await ctx.fns.models.listModels({ id: c.id })).toMatchObject({ models: [{ id: "manual-1" }], source: "manual", cachedAt: null });
        delete ctx.state.models.providers.acme.definition.listModels;
        expect(await ctx.fns.models.listModels({ id: c.id })).toEqual({ models: [{ id: "manual-1", disabled: false }], source: "manual", cachedAt: null });
    });

    test("action: declared runs, unknown is refused without calls, credential results withheld", async () => {
        const { ctx, calls, create } = await setup();
        const c = await create();
        expect(await ctx.fns.models.action({ id: c.id, action: "echo", input: { x: 1 } })).toEqual({ got: { x: 1 } });
        await expect(ctx.fns.models.action({ id: c.id, action: "login" })).rejects.toMatchObject({ code: "UNKNOWN_ACTION" });
        await expect(ctx.fns.models.action({ id: c.id, action: "__proto__" })).rejects.toMatchObject({ code: "UNKNOWN_ACTION" });
        expect(calls.action).toBe(1);
        const err = await ctx.fns.models.action({ id: c.id, action: "echo", input: "leak" }).catch((e: Error) => e);
        expect(err).toBeInstanceOf(Error); expect(String(err.message)).not.toContain(KEY);
    });
});

describe("models.api", () => {
    const owner = { user: { id: "u1", role: "owner" } } as unknown as Session;
    const member = { user: { id: "u2", role: "member" } } as unknown as Session;
    async function http() {
        const s = await setup();
        s.ctx.state.registry.auth.verifyCsrf = async (_c: unknown, _s: unknown, o: { token: string }) => o.token === "good";
        s.ctx.state.registry.auth.csrfToken = async () => "good";
        const post = (body: unknown, opts: { session?: Session | null; token?: string; type?: string; origin?: string; raw?: string } = {}) => api(s.ctx, opts.session === undefined ? owner : opts.session, { req: new Request("http://local/models/api", {
            method: "POST", body: opts.raw ?? JSON.stringify(body),
            headers: { "content-type": opts.type ?? "application/json", "x-csrf-token": opts.token ?? "good", ...(opts.origin ? { origin: opts.origin } : {}) },
        }) });
        return { ...s, post };
    }

    test("401 anonymous, 403 non-owner, missing CSRF, cross-origin, 415, 413", async () => {
        const { ctx, post } = await http();
        expect((await api(ctx, null, { req: new Request("http://local/models/api") })).status).toBe(401);
        expect((await api(ctx, member, { req: new Request("http://local/models/api") })).status).toBe(403);
        expect((await post({ action: "list" }, { session: member })).status).toBe(403);
        const create = { action: "create", provider: "acme", accountName: "w", config: { baseUrl: "https://a.example" }, secrets: { apiKey: KEY } };
        expect((await post(create, { token: "" })).status).toBe(403);
        expect((await post(create, { origin: "https://evil.example" })).status).toBe(403);
        expect((await post(create, { type: "text/plain" })).status).toBe(415);
        expect((await post(null, { raw: JSON.stringify({ ...create, pad: "x".repeat(70000) }) })).status).toBe(413);
        expect((await post(null, { raw: "{" })).status).toBe(400);
        expect(await ctx.fns.models.list({})).toEqual([]);
    });

    test("each action works and responses stay secret-free", async () => {
        const { ctx, post } = await http();
        const get = await api(ctx, owner, { req: new Request("http://local/models/api") });
        const overview = await get.json();
        expect(overview).toMatchObject({ providers: [{ id: "acme" }], connections: [], csrfToken: "good" });
        const created = await post({ action: "create", provider: "acme", accountName: "w", config: { baseUrl: "https://a.example", models: ["m"] }, secrets: { apiKey: KEY, org: ORG } });
        expect(created.status).toBe(201);
        const { connection } = await created.json();
        const bodies: unknown[] = [connection];
        for (const body of [
            { action: "providers" }, { action: "list" }, { action: "get", id: connection.id },
            { action: "update", id: connection.id, accountName: "w2", secrets: { org: null } },
            { action: "test", id: connection.id }, { action: "models", id: connection.id }, { action: "usage", id: connection.id },
            { action: "action", id: connection.id, name: "echo", input: 1 },
        ]) {
            const res = await post(body);
            expect(res.status).toBe(200);
            bodies.push(await res.json());
        }
        noSecrets(bodies);
        expect((bodies[4] as any).connection).toMatchObject({ accountName: "w2", secrets: { apiKey: true, org: false } });
        expect(bodies[5]).toMatchObject({ result: { status: "available" } });
        expect(bodies[6]).toEqual({ models: [{ id: "m", disabled: false }], source: "manual", cachedAt: null });
        expect(bodies[8]).toEqual({ result: { got: 1 } });
        const bad = await post({ action: "create", provider: "acme", accountName: "", config: {}, secrets: {} });
        expect(bad.status).toBe(400); expect(await bad.json()).toMatchObject({ field: "accountName" });
        expect((await post({ action: "action", id: connection.id, name: "nope" })).status).toBe(400);
        expect((await post({ action: "frobnicate" })).status).toBe(400);
        expect((await post({ action: "remove", id: connection.id })).status).toBe(400);
        expect(await (await post({ action: "remove", id: connection.id, confirmed: true })).json()).toEqual({ removed: connection.id });
        expect((await post({ action: "get", id: connection.id })).status).toBe(404);
    });
});
