import { describe, expect, test } from "bun:test";
import reasoningBody from "./opencodeReasoningBody";
import call from "./call";
import streamOpenAI from "./streamOpenAI";
import streamAnthropic from "./streamAnthropic";
import streamCodex from "./streamCodex";

type Api = "openai" | "anthropic" | "responses";
function harness(api: Api, effort = "high", values = ["none", "low", "medium", "high", "max"], toggle = false) {
    const captured: any[] = [];
    const ctx: any = { env: {}, state: {}, fns: {
        agent: { buildLlmRequest: async () => ({ system: "sys", messages: [{ role: "user", content: "hi" }] }), wireTools: () => [], cacheRoot: async () => "root" },
        llm: {
            resolveEndpoint: async () => ({ provider: "opencode", api, modelId: "m", apiKey: "fake", url: "https://opencode.ai/zen/v1/messages" }),
            opencodeCatalog: async (opts: any) => { expect(opts).toEqual({ cachedOnly: true }); return { models: [{ id: "m", api, reasoningOptions: [...(values.length ? [{ type: "effort", values }] : []), ...(toggle ? [{ type: "toggle" }] : [])] }] }; },
            resolveReasoningEffort: async (opts: any) => ({ applied: opts.effort === "auto" ? "low" : opts.effort, mode: api === "anthropic" ? "anthropic-adaptive" : "openai" }),
            opencodeReasoningBody: (opts: any) => reasoningBody(ctx, null, opts),
            toOpenAIMessages: ({ messages }: any) => messages,
            toAnthropicMessages: ({ messages }: any) => messages,
            toCodexInput: ({ messages }: any) => ({ input: messages }),
            codexCliVersion: async () => "test",
            accountAuthHealth: async () => {},
            parseSSE: async function* () {},
            opencodeFetch: async ({ init }: any) => { captured.push(JSON.parse(init.body));
                if (api === "openai") return Response.json({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });
                if (api === "anthropic" && !JSON.parse(init.body).stream) return Response.json({ content: [{ type: "text", text: "ok" }] });
                return new Response('data: {"type":"response.completed","response":{"status":"completed","output":[]}}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
            },
        },
    } };
    return { ctx, captured, agent: { id: "test", model: "opencode:m", reasoningEffort: effort } as any };
}

describe("OpenCode verified reasoning wire", () => {
    for (const api of ["openai", "anthropic", "responses"] as Api[]) {
        test(`${api}: streaming and nonstreaming use identical verified effort fields`, async () => {
            const { ctx, captured, agent } = harness(api);
            await call(ctx, null, { model: agent.model, user: "hi", reasoningEffort: "high", noFallback: true, max_tokens: 123 });
            await ({ openai: streamOpenAI, anthropic: streamAnthropic, responses: streamCodex }[api])(ctx, null, { agent });
            const field = api === "openai" ? "reasoning_effort" : api === "anthropic" ? "output_config" : "reasoning";
            expect(captured).toHaveLength(2);
            expect(captured[0][field]).toEqual(api === "openai" ? "high" : { effort: "high" });
            expect(captured[1][field]).toEqual(captured[0][field]);
            if (api === "responses") expect(captured[0].max_output_tokens).toBe(123);
        });
        test(`${api}: auto and absent effort metadata omit all settings`, async () => {
            for (const [effort, values] of [["auto", ["high"]], ["high", []]] as Array<[string, string[]]>) {
                const { ctx } = harness(api, effort, values);
                expect(await reasoningBody(ctx, null, { model: "opencode:m", modelId: "m", api, effort: effort as any })).toEqual({});
            }
        });
        test(`${api}: xhigh remains exact or maps to advertised max only`, async () => {
            for (const values of [["xhigh", "max"], ["max"], ["high"]]) {
                const { ctx } = harness(api, "xhigh", values);
                const result = await reasoningBody(ctx, null, { model: "opencode:m", modelId: "m", api, effort: "xhigh" });
                const effort = values.includes("xhigh") ? "xhigh" : values.includes("max") ? "max" : null;
                expect(result).toEqual(!effort ? {} : api === "openai" ? { reasoning_effort: effort } : api === "responses" ? { reasoning: { effort } } : { output_config: { effort } });
            }
        });
    }
    test("missing model and transport mismatch fail closed", async () => {
        const { ctx } = harness("openai");
        expect(await reasoningBody(ctx, null, { model: "opencode:missing", modelId: "missing", api: "openai", effort: "high" })).toEqual({});
        expect(await reasoningBody(ctx, null, { model: "opencode:m", modelId: "m", api: "responses", effort: "high" })).toEqual({});
    });
    for (const api of ["openai", "anthropic", "responses"] as Api[]) {
        test(`${api}: nonstream errors never surface provider response text`, async () => {
            const { ctx } = harness(api);
            ctx.fns.llm.opencodeFetch = async () => new Response("secret-provider-echo", { status: 400 });
            await expect(call(ctx, null, { model: "opencode:m", user: "hi", noFallback: true, temperature: 0.1 })).rejects.toThrow("opencode 400");
        });
    }
    test("off maps to none on OpenAI and only disables Anthropic with advertised toggle", async () => {
        for (const api of ["openai", "responses"] as Api[]) {
            const { ctx } = harness(api);
            expect(await reasoningBody(ctx, null, { model: "opencode:m", modelId: "m", api, effort: "off" })).toEqual(api === "openai" ? { reasoning_effort: "none" } : { reasoning: { effort: "none" } });
        }
        for (const toggle of [false, true]) {
            const { ctx } = harness("anthropic", "off", [], toggle);
            expect(await reasoningBody(ctx, null, { model: "opencode:m", modelId: "m", api: "anthropic", effort: "off" })).toEqual(toggle ? { thinking: { type: "disabled" } } : {});
        }
    });
});
