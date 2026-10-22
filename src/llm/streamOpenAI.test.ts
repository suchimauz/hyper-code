import { test, expect, describe } from "bun:test";
import start from "../agent/start";
import stream from "./streamOpenAI";
import resolveEndpoint from "./resolveEndpoint";
import parseSSE from "./parseSSE";
import fullSystemPrompt from "../agent/fullSystemPrompt";
import buildLlmRequest from "../agent/buildLlmRequest";

// Exercises streamOpenAI directly, bypassing the stream.ts dispatcher.
// Plain-object ctx (not the injecting Proxy) — fns entries are invoked with
// opts only, so real fns are wrapped as (opts) => raw(ctx, null, opts).
const mkCtx = () => {
    const ctx: any = {
        state: {},
        env: { LMSTUDIO_URL: process.env.LMSTUDIO_URL, MODEL: process.env.MODEL },
    };
    ctx.fns = {
        llm: {
            resolveEndpoint: (opts: any) => resolveEndpoint(ctx, null, opts),
            parseSSE: (opts: any) => parseSSE(ctx, null, opts),
            connectFetch: (o: any) => fetch(o.url, o.init),
        },
        agent: {
            fullSystemPrompt: (opts: any) => fullSystemPrompt(ctx, null, opts),
            cacheRoot: async (o: any) => o.agent.id,
            buildLlmRequest: (opts: any) => buildLlmRequest(ctx, null, opts),
        },
    };
    return ctx as unknown as Context;
};

// Live integration with LM Studio at process.env.LMSTUDIO_URL.
// Skipped by default — opt in with LIVE_LLM=1 bun test ./src/llm/streamOpenAI.test.ts.
// Per AGENTS.md, the regular test suite must use mock:* models via streamMock.
describe.skipIf(!process.env.LIVE_LLM)("agent.stream — stateless /v1/chat/completions (LM Studio)", () => {
    test("env loaded from .env.test", () => {
        expect(process.env.LMSTUDIO_URL).toBe("http://localhost:1234");
        expect(process.env.MODEL).toBeDefined();
    });

    test("plain text reply", async () => {
        const ctx = mkCtx();
        const agent = await start(ctx, null, {
            model: process.env.MODEL!,
            systemPrompt: "Reply in one short sentence.",
        });
        agent.messages.push({ role: "user", content: "say hi" });
        const result = await stream(ctx, null, { agent });
        expect(result.text.length).toBeGreaterThan(0);
        expect(result.usage?.prompt_tokens ?? result.usage?.input_tokens).toBeGreaterThan(0);
    }, 60_000);

    test("emits text_delta via onEvent callback", async () => {
        const ctx = mkCtx();
        const agent = await start(ctx, null, {
            model: process.env.MODEL!,
            systemPrompt: "Reply in one short sentence.",
        });
        agent.messages.push({ role: "user", content: "pick a number 1-9" });
        const deltas: string[] = [];
        const result = await stream(ctx, null, {
            agent,
            onEvent: (ev) => { if (ev.type === "text_delta") deltas.push(ev.delta); },
        });
        expect(deltas.length).toBeGreaterThan(0);
        expect(deltas.join("")).toBe(result.text);
    }, 60_000);

});

// Offline gateway protocol regressions: no network and no real credentials.
describe("OpenAI-compatible gateway normalization", () => {
    const run = async (response: Response) => {
        let request: any;
        const events: any[] = [];
        const ctx: any = { fns: {
            agent: { buildLlmRequest: async () => ({ system: "", messages: [] }), wireTools: () => [] },
            llm: {
                resolveEndpoint: async () => ({ provider: "oneapi", modelId: "requested-alias", url: "http://mock.invalid", apiKey: null }),
                toOpenAIMessages: () => [],
                parseSSE: (opts: any) => parseSSE(ctx, null, opts),
                connectFetch: async (opts: any) => { request = JSON.parse(opts.init.body); return response; },
            },
        } };
        const result = await stream(ctx, null, { agent: { model: "oneapi:requested-alias" } as any, onEvent: ev => events.push(ev) });
        return { result, request, events };
    };
    test("accepts JSON fallback, separates reasoning, preserves distinct tool slots and reported model", async () => {
        const { result, request, events } = await run(Response.json({ model: "gateway-reported-alias", usage: { completion_tokens: 3 }, choices: [{ finish_reason: "tool_calls", message: {
            content: "hello", reasoning: "private thought", tool_calls: [
                { id: "a", function: { name: "first", arguments: '{"x":1}' } },
                { id: "b", function: { name: "second", arguments: '{}' } },
            ],
        } }] }));
        expect(request.model).toBe("requested-alias");
        expect(request.stream).toBe(true);
        expect(result.requestedModel).toBe("requested-alias");
        expect(result.responseModel).toBe("gateway-reported-alias");
        expect(result.text).toBe("hello");
        expect(result.thinking).toBe("private thought");
        expect(result.toolCalls).toEqual([{ id: "a", name: "first", args: { x: 1 } }, { id: "b", name: "second", args: {} }]);
        expect(events.map(e => e.type)).toEqual(["text_delta", "thinking_delta"]);
    });
    test("keeps SSE reasoning out of text and concatenates tool arguments", async () => {
        const frames = [
            { model: "reported", choices: [{ delta: { reasoning_content: "thought", tool_calls: [{ index: 0, id: "t", function: { name: "lookup", arguments: '{"x":' } }] } }] },
            { choices: [{ delta: { content: "answer", tool_calls: [{ index: 0, function: { arguments: '2}' } }] }, finish_reason: "tool_calls" }] },
            { choices: [], usage: { total_tokens: 9 } },
        ];
        const { result } = await run(new Response(frames.map(f => `data: ${JSON.stringify(f)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }));
        expect(result.text).toBe("answer");
        expect(result.thinking).toBe("thought");
        expect(result.responseModel).toBe("reported");
        expect(result.usage).toEqual({ total_tokens: 9 });
        expect(result.toolCalls).toEqual([{ id: "t", name: "lookup", args: { x: 2 } }]);
    });
    test("does not silently return an empty answer for non-SSE or gateway error bodies", async () => {
        await expect(run(new Response("not a stream"))).rejects.toThrow("no completion choices");
        await expect(run(Response.json({ error: { message: "private upstream detail" } }))).rejects.toThrow("returned an error");
    });
});

test("Go OpenAI stream passes agent session and the resolved endpoint", async () => {
    let request: any;
    const ctx: any = mkCtx();
    ctx.fns.agent.buildLlmRequest = async () => ({ system: "sys", messages: [{ role: "user", content: "hi" }] });
    ctx.fns.agent.wireTools = () => [];
    ctx.fns.llm.resolveEndpoint = async () => ({ provider: "opencode", api: "openai", modelId: "go-model", apiKey: "fake", url: "https://go.invalid/chat" });
    ctx.fns.llm.toOpenAIMessages = ({ messages }: any) => messages;
    ctx.fns.llm.opencodeReasoningBody = async () => ({ reasoning_effort: "high" });
    ctx.fns.llm.opencodeFetch = async (r: any) => { request = r; return Response.json({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }); };
    const result = await stream(ctx, null, { agent: { id: "go-session", model: "opencode:go-model", messages: [], scratchpad: {} } as any });
    expect(result.text).toBe("ok");
    expect(request.sessionId).toBe("go-session");
    expect(request.url).toBe("https://go.invalid/chat");
    expect(JSON.parse(request.init.body).reasoning_effort).toBe("high");
});
