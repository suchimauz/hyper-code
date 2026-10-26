import { test, expect, describe, afterEach } from "bun:test";
import stream from "./streamAnthropic";
import parseSSE from "./parseSSE";
import toAnthropicMessages from "./toAnthropicMessages";
import classifyError from "./classifyError";

// Offline: drive streamAnthropic through the shared parseSSE with a mocked fetch.
// Uses provider 'anthropic' so no OAuth refresh path is touched.
function sseResponse(...chunks: string[]): Response {
    chunks.push("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n");
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        start(c) { for (const s of chunks) c.enqueue(enc.encode(s)); c.close(); },
    });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}
// Plain-object ctx (not the injecting Proxy) — fns entries are invoked with
// opts only, so shared real fns are wrapped as (opts) => raw(ctx, null, opts).
function mkCtx(): Context {
    const ctx: any = { state: {}, env: {} };
    ctx.fns = {
        agent: {
            cacheRoot: async (o: any) => o.agent.id,
            buildLlmRequest: async () => ({ system: "sys", messages: [{ role: "user", content: "hi" }] }),
            wireTools: () => [],
        },
        llm: {
            resolveEndpoint: () => ({ url: "http://mock/v1/messages", modelId: "claude-x", apiKey: "k", provider: "anthropic", api: "anthropic" }),
            parseSSE: (opts: any) => parseSSE(ctx, null, opts),
            resolveReasoningEffort: async () => ({ requested: "high", applied: "high", mode: "anthropic-adaptive", downgraded: false, reason: null }),
            connectFetch: (o: any) => fetch(o.url, o.init),
            toAnthropicMessages: (opts: any) => toAnthropicMessages(ctx, null, opts),
        },
    };
    return ctx as unknown as Context;
}
const agent = () => ({ id: "a1", model: "anthropic:claude-x", systemPrompt: "", messages: [], scratchpad: {} } as any);

describe("streamAnthropic — offline (mocked fetch + shared parseSSE)", () => {
    const realFetch = globalThis.fetch;
    afterEach(() => { globalThis.fetch = realFetch; });

    test("accumulates text deltas, maps stop_reason, reads usage", async () => {
        globalThis.fetch = (async () => sseResponse(
            'event: message_start\ndata: {"message":{"usage":{"input_tokens":10}}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Hel"}}\n\n',
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"lo"}}\n\n',
            'event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n',
        )) as any;
        const deltas: string[] = [];
        const res = await stream(mkCtx(), null, { agent: agent(), onEvent: (ev) => { if (ev.type === "text_delta") deltas.push(ev.delta); } });
        expect(res.text).toBe("Hello");
        expect(res.finishReason).toBe("stop"); // end_turn → stop
        expect(res.usage.prompt_tokens).toBe(10);
        expect(res.usage.completion_tokens).toBe(5);
        expect(deltas.join("")).toBe("Hello");
    });

    test("sends adaptive thinking and Anthropic output effort", async () => {
        let request: any;
        globalThis.fetch = (async (_url:any, init:any) => { request = JSON.parse(init.body); return sseResponse(); }) as any;
        await stream(mkCtx(), null, { agent: { ...agent(), reasoningEffort: "high" } });
        expect(request.thinking).toEqual({ type: "adaptive" });
        expect(request.output_config).toEqual({ effort: "high" });
    });


    test("Claude 5 never gets thinking disabled or an effort the API rejects", async () => {
        const sent = async (modelId: string, applied: string) => {
            let request: any;
            globalThis.fetch = (async (_url: any, init: any) => { request = JSON.parse(init.body); return sseResponse(); }) as any;
            const ctx: any = mkCtx();
            ctx.fns.llm.resolveEndpoint = () => ({ url: "http://mock/v1/messages", modelId, apiKey: "k", provider: "anthropic", api: "anthropic" });
            ctx.fns.llm.resolveReasoningEffort = async () => ({ requested: "auto", applied, mode: "anthropic-adaptive", downgraded: false, reason: null });
            await stream(ctx, null, { agent: agent() });
            return request;
        };
        const auto5 = await sent("claude-opus-5-5", "off");
        expect(auto5.thinking).toBeUndefined();
        expect(auto5.output_config).toBeUndefined();
        expect((await sent("claude-opus-5-5", "xhigh")).output_config).toEqual({ effort: "max" });
        expect((await sent("claude-sonnet-4-6", "off")).thinking).toEqual({ type: "disabled" });
    });

    test("handles Kimi-style SSE (no space after colon) + thinking deltas", async () => {
        globalThis.fetch = (async () => sseResponse(
            'event:content_block_delta\ndata:{"delta":{"type":"thinking_delta","thinking":"hmm"}}\n\n',
            'event:content_block_delta\ndata:{"delta":{"type":"text_delta","text":"yo"}}\n\n',
        )) as any;
        const res = await stream(mkCtx(), null, { agent: agent() });
        expect(res.text).toBe("yo");
        expect(res.thinking).toBe("hmm");
    });
});

    test("marks cache breakpoints on the bootstrap turn and the conversation tail", async () => {
        let request: any;
        globalThis.fetch = (async (_url: any, init: any) => { request = JSON.parse(init.body); return sseResponse(); }) as any;
        const ctx: any = mkCtx();
        ctx.fns.agent.buildLlmRequest = async () => ({ system: "sys", messages: [
            { role: "user", content: "core prompt" },
            { role: "assistant", content: "Understood. Ready to act." },
            { role: "user", content: "hi" },
        ] });
        await stream(ctx, null, { agent: agent() });
        const m = request.messages;
        expect(m.length).toBe(3);
        expect(m[1].content[m[1].content.length - 1].cache_control).toEqual({ type: "ephemeral" });
        expect(m[2].content[0]).toEqual({ type: "text", text: "hi", cache_control: { type: "ephemeral" } });
        expect(m[0].content[0].cache_control).toBeUndefined();
    });

    test("reports cached prompt tokens in usage", async () => {
        globalThis.fetch = (async () => sseResponse(
            'event: message_start\ndata: {"message":{"usage":{"input_tokens":5,"cache_read_input_tokens":90,"cache_creation_input_tokens":5}}}\n\n',
        )) as any;
        const res = await stream(mkCtx(), null, { agent: agent() });
        expect(res.usage.prompt_tokens).toBe(100);
        expect(res.usage.cache_read_tokens).toBe(90);
        expect(res.usage.cache_write_tokens).toBe(5);
    });


describe('SSH replay safety', () => {
    function sshCtx(body:string) {
        const ctx:any=mkCtx();
        const original=ctx.fns.llm.resolveEndpoint;
        ctx.fns.llm.resolveEndpoint=()=>({...original(),apiKey:'remote',ssh:{instance:'mock',provider:'claude-code',account:'mock'}});
        ctx.fns.sshAccount={fetch:async()=>new Response(body)};
        return ctx;
    }
    test('truncated EOF and malformed stream are rejected without transport replay',async()=>{
        for(const body of ['', 'data: {bad json}\n\n']) {
            await expect(stream(sshCtx(body),null,{agent:agent()})).rejects.toMatchObject({transportFailure:{phase:'ambiguous',retryable:false}});
        }
    });
    test('provider SSE quota/auth refusals retain classification rather than transport ambiguity',async()=>{
        for (const [type, kind] of [['usage_limit_reached','usage_limit'],['authentication_error','auth']]) {
            const ctx = sshCtx(`event: error\ndata: ${JSON.stringify({type:'error',error:{type,message:type}})}\n\n`);
            const resolve = ctx.fns.llm.resolveEndpoint;
            ctx.fns.llm.resolveEndpoint = () => ({...resolve(),kind:'subscription',quotaAccount:'ssh/mock/account'});
            ctx.fns.llm.classifyError = (opts: any) => classifyError(ctx,null,opts);
            const error = await stream(ctx,null,{agent:agent()}).catch(e => e);
            expect(error.failure).toMatchObject({kind,account:'ssh/mock/account',retryable:false});
            expect(error.transportFailure).toBeUndefined();
        }
    });
    test('valid terminal marker succeeds',async()=>{
        const result=await stream(sshCtx("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"),null,{agent:agent()});
        expect(result.toolCalls).toEqual([]);
    });
    test('transport failure causes exactly one fetch, no inner retry',async()=>{
        const ctx=sshCtx('');let calls=0;
        ctx.fns.sshAccount.fetch=async()=>{calls++;throw Object.assign(Error('lost'),{transportFailure:{kind:'ssh_transport',phase:'before_dispatch',retryable:true}});};
        await expect(stream(ctx,null,{agent:agent()})).rejects.toThrow('lost');
        expect(calls).toBe(1);
    });
});

test("Go Anthropic stream passes stable session, required output budget and reasoning", async () => {
    let request: any;
    const ctx: any = mkCtx();
    ctx.fns.llm.resolveEndpoint = async () => ({ provider: "opencode", api: "anthropic", modelId: "go-model", apiKey: "fake", url: "https://go.invalid/messages" });
    ctx.fns.llm.opencodeReasoningBody = async () => ({ thinking: { type: "adaptive" }, output_config: { effort: "high" } });
    ctx.fns.llm.opencodeFetch = async (r: any) => { request = r; return sseResponse(); };
    await stream(ctx, null, { agent: { ...agent(), model: "opencode:go-model" } });
    expect(request.sessionId).toBe("a1");
    expect(request.url).toBe("https://go.invalid/messages");
    const body = JSON.parse(request.init.body);
    expect(body.max_tokens).toBe(16384);
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body.output_config).toEqual({ effort: "high" });
});

describe("Kimi response-channel opener", () => {
    const opener = "<|open|>response";
    async function run(chunks: string[], provider = "kimi-coding", ssh = false) {
        const ctx: any = mkCtx();
        ctx.fns.llm.resolveEndpoint = () => ({ provider, api: "anthropic", modelId: "k3-256k", url: "https://mock.invalid/messages", ...(ssh ? { ssh: { instance: "mock", provider, account: "test" } } : {}) });
        ctx.fns.llm.refreshKimiCode = async () => null;
        const response = () => sseResponse(...chunks.map(text => `event: content_block_delta\ndata: ${JSON.stringify({ delta: { type: "text_delta", text } })}\n\n`));
        ctx.fns.llm.connectFetch = async () => response();
        ctx.fns.sshAccount = { fetch: async () => response() };
        const emitted: string[] = [];
        const result = await stream(ctx, null, { agent: agent(), onEvent: (e: any) => { if (e.type === "text_delta") emitted.push(e.delta); } });
        expect(emitted.join("")).toBe(result.text);
        return result.text;
    }
    test("removes the reported opener for SSH Kimi before streaming or persistence", async () => {
        expect(await run([opener + "Привет! Что делаем дальше?"], "kimi-coding", true)).toBe("Привет! Что делаем дальше?");
    });
    test("recognizes every SSE split of the opener", async () => {
        for (let i = 1; i < opener.length; i++) {
            expect(await run([opener.slice(0, i), opener.slice(i), "Привет!"])).toBe("Привет!");
        }
        expect(await run([...opener, "Hello"])).toBe("Hello");
        expect(await run([opener])).toBe("");
    });
    test("preserves ordinary content, embedded markers, partials and non-Kimi providers", async () => {
        for (const text of ["Привет!", "Example: " + opener, "<|open|>", "<|open|>respond", "<", ""]) {
            expect(await run([text])).toBe(text);
        }
        expect(await run([opener + "Hello"], "anthropic")).toBe(opener + "Hello");
        expect(await run([opener + opener + "Hello"])).toBe(opener + "Hello");
    });
});
