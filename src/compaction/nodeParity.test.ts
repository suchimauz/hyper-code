import { describe, expect, test } from "bun:test";
import identity from "./modelIdentity";
import windowSize from "./contextWindow";
import resolve from "./resolve";
import portable from "./portable";
import compactCodex from "../llm/compactCodex";
import autoCompact from "../agent/autoCompactIfNeeded";
import generic from "./$compaction_default";

const route = "hyper/mini6:codex/named:gpt-6-astra";
function fixture() {
    const ctx: any = { state: { compaction: { compactors: { default: { provider: "default" }, codex: { provider: "codex" } } } }, fns: { node: { get: async () => ({ enabled: true, catalog: [{ id: "codex/named:gpt-6-astra", provider: "codex", account: "named", api: "responses" }] }) }, compaction: {}, llm: {} } };
    ctx.fns.compaction.modelIdentity = (o: any) => identity(ctx, null, o);
    ctx.fns.compaction.contextWindow = (o: any) => windowSize(ctx, null, o);
    ctx.fns.compaction.resolve = (o: any) => resolve(ctx, null, o);
    return ctx;
}
describe("node native compaction parity without credentials or generation", () => {
    test("direct, canonical and unambiguous legacy routes resolve upstream window and compactor", async () => {
        const ctx = fixture();
        for (const model of ["codex/named:gpt-6-astra", route, "hyper/mini6:gpt-6-astra"]) {
            expect(await windowSize(ctx, null, { model })).toBe(272000);
            expect(await resolve(ctx, null, { model })).toMatchObject({ provider: "codex", fallback: false });
        }
        ctx.fns.node.get = async () => null;
        expect(await windowSize(ctx, null, { model: route })).toBeNull();
        expect(await resolve(ctx, null, { model: route })).toMatchObject({ fallback: true });
    });
    test("ambiguous, disabled, inconsistent and wrong API catalogues are not trusted", async () => {
        const ctx = fixture();
        const entry = (await ctx.fns.node.get()).catalog[0];
        for (const node of [{ enabled: false, catalog: [entry] }, { enabled: true, catalog: [entry, entry] }, { enabled: true, catalog: [{ ...entry, account: "other" }] }, { enabled: true, catalog: [{ ...entry, api: "openai" }] }]) {
            ctx.fns.node.get = async () => node;
            expect(await windowSize(ctx, null, { model: route })).toBeNull();
        }
    });
    test("272K window triggers at 217600 despite configured 700000", async () => {
        const ctx = fixture(); let compacted = 0; let tokens = 217599;
        ctx.fns.agent = { normalizeSleepContext: () => null, compactContext: async () => { compacted++; return { status: "compacted" }; } };
        ctx.fns.session = { getMessages: async () => [] };
        ctx.fns.procs = { db: { select: async (o: any) => o.sql.includes("FROM agents") ? [{ run_state: "idle" }] : [{ payload: JSON.stringify({ usage: { prompt_tokens: tokens } }), ts: 1 }] } };
        ctx.fns.settings = { getNumber: async (o: any) => o.key === "autoCompactTokens" ? 700000 : 80 };
        expect((await autoCompact(ctx, null, { agent: { id: "test", model: route } as any })).status).toBe("below_threshold");
        tokens++;
        expect((await autoCompact(ctx, null, { agent: { id: "test", model: route } as any })).status).toBe("compacted");
        expect(compacted).toBe(1);
    });
    test("native relay uses node bearer, canonical wire model and compaction trigger, never refreshes local credentials", async () => {
        const ctx = fixture(); let request: any;
        ctx.fns.llm.resolveEndpoint = async () => ({ provider: "hyper", upstream: "codex", api: "responses", apiKey: "node-bearer", modelId: "codex/named:gpt-6-astra", url: "http://node/responses" });
        ctx.fns.llm.refreshCodex = () => { throw new Error("local credential access forbidden"); };
        ctx.fns.llm.toCodexInput = () => ({ input: [{ role: "user", content: "hello" }], instructions: "system" });
        ctx.fns.llm.codexCliVersion = async () => "test";
        ctx.fns.llm.connectFetch = async (o: any) => { request = o; return new Response("stub"); };
        ctx.fns.llm.parseSSE = async function* () { yield { data: JSON.stringify({ type: "response.output_item.done", item: { type: "compaction", encrypted_content: "opaque" } }) }; yield { data: JSON.stringify({ type: "response.completed", response: { id: "r", usage: { input_tokens: 10 } } }) }; };
        const controller = new AbortController();
        const result = await compactCodex(ctx, null, { model: route, sessionId: "session", instructions: "system", messages: [], signal: controller.signal });
        expect(result.item.encrypted_content).toBe("opaque");
        expect(request.url).toBe("http://node/responses");
        expect(request.init.signal).toBe(controller.signal);
        expect(request.init.headers.authorization).toBe("Bearer node-bearer");
        expect(request.init.headers["chatgpt-account-id"]).toBeUndefined();
        expect(JSON.parse(request.init.body)).toMatchObject({ model: "codex/named:gpt-6-astra", input: [{ role: "user", content: "hello" }, { type: "compaction_trigger" }] });
    });
    test("same node checkpoints replay; different account or transport fails closed to root", () => {
        const messages = [{ role: "user", content: JSON.stringify({ type: "compaction", encrypted_content: "opaque" }), message_type: "codex_compaction" }];
        expect(portable(fixture(), null, { model: route, producedBy: route, messages })).toEqual(messages);
        for (const model of ["codex/named:gpt-6-astra", "hyper/mini6:codex/other:gpt-6-astra"]) expect(portable(fixture(), null, { model, producedBy: route, messages })).toBeNull();
    });
    test("generic overflow retries with oldest removed, single oversized item fails explicitly", async () => {
        const ctx = fixture(); const sizes: number[] = [];
        ctx.fns.procs = { log: { warn: () => {} } };
        ctx.fns.llm.call = async (o: any) => { const h = JSON.parse(o.user); sizes.push(h.length); if (h.length > 1) throw new Error("context_length_exceeded"); return { text: "summary" }; };
        const opts: any = { model: route, sessionId: "test", messages: [{ role: "user", content: "old" }, { role: "user", content: "new" }] };
        expect((await generic(ctx, null, opts)).summary).toBe("summary");
        expect(sizes).toEqual([2, 1]);
        ctx.fns.llm.call = async () => { throw new Error("context_length_exceeded"); };
        await expect(generic(ctx, null, { ...opts, messages: [opts.messages[0]] })).rejects.toThrow("context_length_exceeded");
    });
});
