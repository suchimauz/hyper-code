import { describe, expect, test } from "bun:test";
import capabilities from "./reasoningCapabilities";
import resolve from "./resolveReasoningEffort";
import endpoint from "./resolveEndpoint";
import stream from "./streamCodex";
import parseSSE from "./parseSSE";
import toCodexInput from "./toCodexInput";
import picker from "../agent/effortPicker";
import relay from "../node/relay";

const entry = (account = "su4imauz") => ({ id: `codex/${account}:gpt-6-astra`, provider: "codex", account, api: "responses", kind: "subscription" });
function context(catalog: any[] = [entry(), entry("second")]) {
    const node = { enabled: true, catalog, url: "http://node.invalid/v1" };
    const ctx: any = { state: { agent: {} }, fns: {
        node: { get: async () => node, token: async () => "mock-node-token" },
        agent: { cacheRoot: async () => "test", buildLlmRequest: async () => ({ system: "sys", messages: [] }), wireTools: () => [] },
        llm: {},
        procs: { ui: { escape: ({ text }: any) => Bun.escapeHTML(text), button: ({ html }: any) => `<button>${html}</button>` } },
        ui: { popupContent: ({ html }: any) => html },
    } };
    ctx.fns.llm = {
        reasoningCapabilities: (o: any) => capabilities(ctx, null, o),
        resolveReasoningEffort: (o: any) => resolve(ctx, null, o),
        resolveEndpoint: (o: any) => endpoint(ctx, null, o),
        toCodexInput: (o: any) => toCodexInput(ctx, null, o),
        parseSSE: (o: any) => parseSSE(ctx, null, o),
        codexCliVersion: async () => "test",
        accountAuthHealth: async () => [],
        connectFetch: async () => { throw new Error("unexpected network"); },
    };
    return { ctx, node };
}

describe("node reasoning identity and picker", () => {
    for (const account of ["su4imauz", "second"]) test(`canonical ${account}: real picker and policy`, async () => {
        const { ctx } = context();
        const model = `hyper/mini6:codex/${account}:gpt-6-astra`;
        ctx.state.agent.test = { id: "test", model, reasoningEffort: "high" };
        expect(await capabilities(ctx, null, { model })).toEqual({ supported: ["auto", "low", "medium", "high", "xhigh"], defaultEffort: "medium", mode: "openai-effort" });
        const html = await (await picker(ctx, null, { agentId: "test" })).text();
        const values = [...html.matchAll(/name="effort" value="(.*?)"/g)].map(m => m[1]);
        expect(values).toEqual(["auto", "low", "medium", "high", "xhigh"]);
        expect(html).toContain(model);
        expect(await resolve(ctx, null, { model, effort: "auto" })).toMatchObject({ applied: "medium", downgraded: false });
        for (const effort of ["off", "minimal"] as const) expect(await resolve(ctx, null, { model, effort })).toMatchObject({ applied: "low", downgraded: true, requested: effort });
    });
    test("unique legacy routes and old bare catalog entries resolve", async () => {
        for (const catalog of [[entry()], [{ ...entry(), id: "gpt-6-astra" }]]) {
            const { ctx } = context(catalog);
            expect((await capabilities(ctx, null, { model: "hyper/mini6:gpt-6-astra" })).mode).toBe("openai-effort");
        }
    });
    test("missing, disabled, ambiguous, invalid or unreadable node fails closed", async () => {
        const { ctx, node } = context();
        const model = "hyper/mini6:gpt-6-astra";
        expect((await capabilities(ctx, null, { model })).mode).toBe("none");
        for (const value of [null, { ...node, enabled: false }, { ...node, catalog: [] }, { ...node, catalog: [{ ...entry(), provider: "anthropic" }] }]) {
            ctx.fns.node.get = async () => value;
            expect((await capabilities(ctx, null, { model: `hyper/mini6:${entry().id}` })).mode).toBe("none");
        }
        ctx.fns.node.get = async () => { throw new Error("DB unavailable"); };
        expect((await capabilities(ctx, null, { model })).mode).toBe("none");
    });
    test("upstream provider determines Anthropic capabilities too", async () => {
        const { ctx } = context([{ ...entry(), id: "anthropic/work:claude-opus-4-6", provider: "anthropic", account: "work", api: "anthropic" }]);
        expect((await capabilities(ctx, null, { model: "hyper/mini6:anthropic/work:claude-opus-4-6" })).mode).toBe("anthropic-adaptive");
    });
});

describe("node reasoning wire (no generation or network)", () => {
    for (const account of ["su4imauz", "second"]) test(`streamCodex keeps canonical model and sends effort: ${account}`, async () => {
        const { ctx } = context();
        const model = `hyper/mini6:codex/${account}:gpt-6-astra`;
        for (const [requested, applied] of [["high", "high"], ["xhigh", "xhigh"], ["auto", "medium"], ["off", "low"]]) {
            let body: any;
            ctx.fns.llm.connectFetch = async (o: any) => { body = JSON.parse(o.init.body); return new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }); };
            await stream(ctx, null, { agent: { id: "test", model, reasoningEffort: requested, scratchpad: {} } as any });
            expect(body.model).toBe(`codex/${account}:gpt-6-astra`);
            expect(body.reasoning).toEqual({ effort: applied, summary: "auto" });
        }
    });
    test("relay strips only canonical identity and preserves reasoning for both accounts", async () => {
        const original = globalThis.fetch;
        try {
            for (const account of ["su4imauz", "second"]) {
                let body: any;
                globalThis.fetch = (async (_url: any, init: any) => { body = JSON.parse(init.body); return new Response("data: [DONE]\n\n"); }) as any;
                const { ctx } = context();
                ctx.fns.node.authorize = async () => ({ ok: true, client: { name: "client", providers: [] }, hops: 0 });
                ctx.fns.node.catalog = async () => [entry(), entry("second")];
                ctx.fns.node.upstream = async (o: any) => { expect(o.account).toBe(account); return { url: "http://mock.invalid", headers: {} }; };
                ctx.fns.procs.log = { info: () => {} };
                const reasoning = { effort: "xhigh", summary: "auto" };
                const req = new Request("http://node.invalid", { method: "POST", body: JSON.stringify({ model: entry(account).id, reasoning }) });
                expect((await relay(ctx, null, { req, api: "responses" })).status).toBe(200);
                expect(body).toEqual({ model: "gpt-6-astra", reasoning });
            }
        } finally { globalThis.fetch = original; }
    });
});
