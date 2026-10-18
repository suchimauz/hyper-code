import { test, expect } from "bun:test";
import resolve from "./resolveEndpoint";
import classify from "./classifyError";
import park from "../agent/parkOnUsageLimit";
import setModel from "../agent/setModel";

const catalog = ["a", "b"].map(account => ({ id: `codex/${account}:gpt-test`, provider: "codex", account, api: "responses", kind: "subscription" }));
function fixture(entries = catalog) {
    const rows = [
        { id: "a1", model: "hyper/mini6:codex/a:gpt-test" },
        { id: "a2", model: "hyper/mini6:codex/a:other" },
        { id: "b", model: "hyper/mini6:codex/b:gpt-test" },
        { id: "legacy", model: "hyper/mini6:gpt-test" },
        { id: "local", model: "codex/a:gpt-test" },
        { id: "other", model: "hyper/other:codex/a:gpt-test" },
    ];
    const ctx: any = { state: { agent: {} }, fns: {
        node: { get: async () => ({ enabled: true, url: "https://node.test", catalog: entries }), token: async () => "fake" },
        procs: { db: { select: async () => rows, run: async () => {} } },
        session: { mutateScratchpad: async ({mutate}: any) => { const scratchpad = {}; mutate(scratchpad); return {scratchpad}; }, appendEvent: async () => {} },
        events: { refreshAgentMeta: () => {} }, ui: { notify: async () => {} },
        llm: { recordUsage: async () => {} },
    } };
    return {ctx, rows};
}

test("node endpoint keeps transport identity and separates upstream quota", async () => {
    const {ctx} = fixture();
    const a = await resolve(ctx, null, { model: "hyper/mini6:codex/a:gpt-test" });
    const b = await resolve(ctx, null, { model: "hyper/mini6:codex/b:gpt-test" });
    expect(a.account).toBe("mini6");
    expect(a.modelId).toBe("codex/a:gpt-test");
    expect(a.quotaAccount).toBe("mini6/codex/a");
    expect(b.quotaAccount).toBe("mini6/codex/b");
});

test("legacy bare route upgrades only when unique", async () => {
    const {ctx} = fixture([catalog[0]!]);
    const a = await resolve(ctx, null, { model: "hyper/mini6:gpt-test" });
    expect(a.modelId).toBe("codex/a:gpt-test");
    expect(a.quotaAccount).toBe("mini6/codex/a");
    await expect(resolve(fixture().ctx, null, { model: "hyper/mini6:gpt-test" })).rejects.toThrow("ambiguous");
});

test("quota park isolates node, provider and account including unique legacy", async () => {
    const {ctx} = fixture([catalog[0]!, { ...catalog[0]!, id: "codex/a:other" }]);
    const ep = await resolve(ctx, null, { model: "hyper/mini6:codex/a:gpt-test" });
    const info = classify(ctx, null, { provider: ep.provider, account: ep.quotaAccount, kind: ep.kind, status: 429, body: '{"error":{"type":"usage_limit_reached"}}' });
    const result = await park(ctx, null, {info, now: 1000});
    expect(result.parked).toEqual(["a1", "a2", "legacy"]);
});

test("ambiguous legacy and old node-wide failure never park other accounts", async () => {
    const {ctx} = fixture();
    const info = classify(ctx, null, {provider: "hyper", account: "mini6/codex/a", kind: "subscription", status: 429, body: '{"error":{"type":"usage_limit_reached"}}'});
    expect((await park(ctx, null, {info})).parked).toEqual(["a1", "a2"]);
    expect((await park(ctx, null, {info: {...info, account: "mini6"}})).parked).toEqual([]);
});

test("manual provider-scope switch respects upstream quota identity", async () => {
    const {ctx, rows} = fixture();
    const changed: string[] = [];
    ctx.fns.llm.resolveEndpoint = async () => ({apiKey: "fake", provider: "hyper", account: "mini6", kind: "subscription"});
    ctx.fns.procs.db.select = async ({sql, params}: any) => sql.includes("scratchpad")
        ? [{ ...rows[0], scratchpad: JSON.stringify({parked: {provider: "hyper", account: "mini6/codex/a"}}) }]
        : sql.includes("WHERE id = ?") ? rows.filter(r => r.id === params[0]) : rows;
    ctx.fns.agent = {unpark: async ({id}: any) => { changed.push(id); }};
    ctx.fns.session.load = async () => null;
    ctx.fns.events.emitAgentsChanged = () => {};
    const result = await setModel(ctx, null, {id: "a1", model: "hyper/mini6:codex/b:gpt-test", scope: "provider"});
    expect(result.changed).toEqual(["a1", "a2"]);
    expect(changed).toEqual(["a1", "a2"]);
});
