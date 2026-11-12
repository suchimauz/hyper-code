import { describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import claude from "./$modelProvider_claude";

const IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";
const req = { model: "claude-sonnet-4-6", instructions: "Follow instructions", messages: [{ role: "user", content: "Hi" }], sessionId: "session" };
const frames = (events: object[]) => new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(""));
const end = () => frames([{ type: "message_stop" }]);
type Call = { url: string; init: RequestInit };
async function setup(handler: (call: Call) => Response = end) {
    const ctx = await mkTestCtx({ env: {} });
    const calls: Call[] = []; let marked = false;
    ctx.state.registry.models.claudeAuth = async (_c: unknown, _s: unknown, o: { op: string }) => { if (o.op === "markLogin") marked = true; return { loggedIn: true, needsLogin: false, accessToken: "test-token", expiresAt: null }; };
    ctx.state.registry.llm.claudeCodeCliVersion = async () => "2.0.0";
    const conn: types.models.ResolvedConnection = { id: crypto.randomUUID(), provider: "claude", accountName: "me", config: {}, secret: async () => null, fetch: async (url, init = {}) => { const c = { url, init }; calls.push(c); return handler(c); } };
    return { ctx, conn, calls, marked: () => marked };
}

describe("Claude protocol", () => {
    test("static models and not-logged-in check make no requests", async () => {
        const { ctx, conn, calls } = await setup();
        expect((await claude.listModels()).length).toBe(9);
        ctx.state.registry.models.claudeAuth = async () => ({ loggedIn: false, needsLogin: true, expiresAt: null });
        expect(await claude.test(ctx, conn)).toMatchObject({ status: "configured", reason: "login-required" });
        expect(calls).toHaveLength(0);
    });
    test("headers, bootstrap, cache, overrides and unique ids", async () => {
        const { ctx, conn, calls } = await setup();
        await claude.stream(ctx, conn, req); await claude.stream(ctx, conn, req);
        const h = new Headers(calls[0]!.init.headers), next = new Headers(calls[1]!.init.headers);
        expect(h.get("authorization")).toBe("Bearer test-token"); expect(h.has("x-api-key")).toBe(false);
        expect(h.get("anthropic-version")).toBe("2023-06-01"); expect(h.get("x-app")).toBe("cli");
        expect(h.get("anthropic-dangerous-direct-browser-access")).toBe("true"); expect(h.get("user-agent")).toBe("claude-cli/2.0.0 (external, sdk-cli)");
        expect(h.get("x-client-request-id")).not.toBe(next.get("x-client-request-id"));
        const body = JSON.parse(String(calls[0]!.init.body)); expect(body.system).toBe(IDENTITY);
        expect(body.messages[0].content[0].text).toBe(req.instructions);
        expect(body.messages[1].content[0]).toMatchObject({ text: "Understood. Ready to act.", cache_control: { type: "ephemeral" } });
        expect(body.messages[2].content[0].cache_control).toEqual({ type: "ephemeral" });
        ctx.env.CLAUDE_CODE_USER_AGENT = "custom-agent"; ctx.env.CLAUDE_CODE_ANTHROPIC_BETA = "custom-beta";
        await claude.stream(ctx, conn, req); const overridden = new Headers(calls[2]!.init.headers);
        expect(overridden.get("user-agent")).toBe("custom-agent"); expect(overridden.get("anthropic-beta")).toBe("custom-beta");
    });
    test("allow-list refuses methods, paths and non-https before transport", async () => {
        const { ctx, conn, calls } = await setup();
        for (const [url, method] of [["https://api.anthropic.com/evil", "GET"], ["https://api.anthropic.com/v1/messages", "GET"], ["http://api.anthropic.com/api/oauth/usage", "GET"]]) {
            await expect(ctx.fns.models.claudeRequest({ conn, url: url!, init: { method } })).rejects.toMatchObject({ code: "PROXY_CONFIG", requestSent: false });
        }
        expect(calls).toHaveLength(0);
    });
    test("text, thinking, tool deltas and final cache usage", async () => {
        const { ctx, conn } = await setup(() => frames([
            { type: "message_start", message: { usage: { input_tokens: 1 } } },
            { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
            { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "Think" } },
            { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "t", name: "read" } },
            { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"x":1}' } },
            { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { input_tokens: 10, output_tokens: 4, cache_read_input_tokens: 20, cache_creation_input_tokens: 30 } }, { type: "message_stop" },
        ]));
        const events: types.models.StreamEvent[] = [];
        const r = await claude.stream(ctx, conn, { ...req, onEvent: e => events.push(e) });
        expect(r).toMatchObject({ text: "Hello", thinking: "Think", finishReason: "tool_use", usage: { prompt_tokens: 60, completion_tokens: 4, cache_read_tokens: 20, cache_write_tokens: 30 }, toolCalls: [{ id: "t", name: "read", args: { x: 1 } }] }); expect(events).toHaveLength(3);
    });
    test("truncated tool JSON is preserved, but truncated or malformed streams fail", async () => {
        const { ctx, conn } = await setup(() => frames([{ type: "content_block_start", content_block: { type: "tool_use", id: "t", name: "read" } }, { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: '{"x":' } }, { type: "message_stop" }]));
        expect((await claude.stream(ctx, conn, req)).toolCalls[0]!.args).toEqual({ __unparsed: '{"x":' });
        conn.fetch = async () => frames([{ type: "message_start" }]);
        await expect(claude.stream(ctx, conn, req)).rejects.toMatchObject({ code: "PROXY_CONNECTION_LOST", retryable: true });
        conn.fetch = async () => new Response("data: {bad\n\n");
        await expect(claude.stream(ctx, conn, req)).rejects.toMatchObject({ code: "PROXY_PROTOCOL", retryable: false });
    });
    test("quota vs throttle, unauthorized and SSE errors", async () => {
        const { ctx, conn, marked } = await setup();
        conn.fetch = async () => Response.json({ error: { type: "usage_limit_reached", message: "usage limit reached" } }, { status: 429 });
        await expect(claude.stream(ctx, conn, req)).rejects.toMatchObject({ code: "USAGE_LIMIT", retryable: false });
        conn.fetch = async () => Response.json({ error: { type: "rate_limit_error", message: "too many requests" } }, { status: 429, headers: { "retry-after": "3" } });
        await expect(claude.stream(ctx, conn, req)).rejects.toMatchObject({ retryable: true });
        conn.fetch = async () => new Response("unauthorized", { status: 401 });
        await expect(claude.stream(ctx, conn, req)).rejects.toThrow(); expect(marked()).toBe(true);
        conn.fetch = async () => frames([{ type: "error", error: { type: "overloaded_error", message: "overloaded" } }]);
        await expect(claude.stream(ctx, conn, req)).rejects.toMatchObject({ retryable: true });
    });
    test("compaction preserves signed block, focus, usage and reports missing block", async () => {
        const { ctx, conn, calls } = await setup(() => Response.json({ content: [{ type: "compaction", content: "summary", signature: "sig" }], usage: { iterations: [{ type: "compaction", input_tokens: 42, output_tokens: 5 }] } }));
        expect(await claude.compact(ctx, conn, { ...req, focus: "paths", maxTokens: 500 })).toMatchObject({ item: { content: "summary", signature: "sig" }, usage: { prompt_tokens: 42, completion_tokens: 5 } });
        const b = JSON.parse(String(calls[0]!.init.body)); expect(b.system).toEqual([{ type: "text", text: IDENTITY }, { type: "text", text: req.instructions }]); expect(b.max_tokens).toBe(500); expect(b.compaction.instructions).toContain("Focus: paths");
        conn.fetch = async () => Response.json({ content: [], stop_reason: "max_tokens" });
        await expect(claude.compact(ctx, conn, req)).rejects.toThrow("max_tokens");
    });
    test("usage profile and optional profile failure, missing windows rejected", async () => {
        const { ctx, conn } = await setup(c => Response.json(c.url.endsWith("profile") ? { organization: { organization_type: "claude_max" } } : { five_hour: { utilization: 25, resets_at: "2030-01-01T00:00:00Z" }, seven_day: { utilization: 60 } }));
        expect(await claude.usage(ctx, conn)).toMatchObject({ plan: "Max", windows: [{ usedPercent: 25 }, { usedPercent: 60 }] });
        conn.fetch = async url => url.endsWith("profile") ? new Response("no", { status: 500 }) : Response.json({ five_hour: { utilization: 25 } });
        expect((await claude.usage(ctx, conn)).windows).toHaveLength(1);
        conn.fetch = async () => Response.json({}); await expect(claude.usage(ctx, conn)).rejects.toThrow("no quota windows");
    });
    test("thinking modes and replayed compaction beta", async () => {
        const { ctx, conn, calls } = await setup();
        for (const [model, effort, expected] of [["claude-sonnet-4-6", "off", "disabled"], ["claude-sonnet-4-6", "high", "adaptive"], ["claude-sonnet-5", "off", "adaptive"], ["claude-sonnet-5", "auto", undefined]]) {
            await claude.stream(ctx, conn, { ...req, model: model!, reasoningEffort: effort });
            expect(JSON.parse(String(calls.at(-1)!.init.body)).thinking?.type).toBe(expected);
        }
        await claude.stream(ctx, conn, { ...req, messages: [{ role: "assistant", message_type: "anthropic_compaction", content: JSON.stringify({ type: "compaction", content: "summary", signature: "sig" }) }, ...req.messages] });
        expect(new Headers(calls.at(-1)!.init.headers).get("anthropic-beta")).toContain("compact-2026-09-04");
    });
    test("error payloads never expose echoed credentials", async () => {
        const { ctx, conn } = await setup(() => Response.json({ error: { type: "unknown", message: "echo test-token secret-refresh" } }, { status: 400 }));
        try { await claude.stream(ctx, conn, req); throw new Error("expected failure"); } catch (error) {
            expect(String(error)).not.toContain("test-token"); expect(JSON.stringify(error)).not.toContain("secret-refresh"); expect(JSON.stringify(error)).not.toContain("test-token");
        }
    });
    test("rate headers cache only observed windows, missing headers never mean zero", async () => {
        const { ctx, conn } = await setup();
        const snapshots: unknown[] = [];
        ctx.state.registry.models.get = async () => ({ id: conn.id, updatedAt: 1 });
        ctx.state.registry.models.cached = async (_c: unknown, _s: unknown, o: { run: () => Promise<unknown> }) => { const r = await o.run(); snapshots.push(r); return r; };
        await claude.stream(ctx, conn, req); expect(snapshots).toHaveLength(0);
        conn.fetch = async () => new Response('data: {"type":"message_stop"}\n\n', { headers: { "anthropic-ratelimit-unified-5h-utilization": "0.42", "anthropic-ratelimit-unified-5h-reset": "2000000000" } });
        await claude.stream(ctx, conn, req);
        expect(snapshots).toEqual([expect.objectContaining({ windows: [{ label: "Session", usedPercent: 42, resetAt: 2000000000000 }] })]);
    });
    test("byte parity with legacy stream and compact", async () => {
        const { ctx, conn, calls } = await setup();
        const captured: RequestInit[] = [];
        ctx.state.registry.llm.resolveEndpoint = async () => ({ api: "anthropic", provider: "anthropic-oauth", kind: "subscription", modelId: req.model, url: "https://api.anthropic.com/v1/messages", apiKey: "test-token", account: "me", noFallback: true });
        ctx.state.registry.llm.getAnthropicOAuthToken = async () => "test-token";
        ctx.state.registry.agent.buildLlmRequest = async () => ({ system: IDENTITY, messages: [{ role: "user", content: req.instructions }, { role: "assistant", content: "Understood. Ready to act." }, ...req.messages], cacheableMessageCount: 3 });
        ctx.state.registry.agent.wireTools = () => [];
        ctx.state.registry.llm.recordUsage = async () => undefined;
        ctx.state.registry.llm.claudeFetch = async (_c: unknown, _s: unknown, o: { init: RequestInit }) => { captured.push(o.init); return end(); };
        await claude.stream(ctx, conn, req);
        await ctx.fns.llm.streamAnthropic({ agent: { model: `anthropic-oauth:${req.model}`, reasoningEffort: "auto" } as types.agent.Agent });
        const normalizedHeaders = (h: RequestInit["headers"]) => { const v = new Headers(h); v.delete("x-client-request-id"); return Object.fromEntries(v.entries()); };
        expect(calls[0]!.init.body).toBe(captured[0]!.body); expect(normalizedHeaders(calls[0]!.init.headers)).toEqual(normalizedHeaders(captured[0]!.headers));
        const compactResponse = () => Response.json({ content: [{ type: "compaction", content: "summary", signature: "sig" }] });
        conn.fetch = async (_url, init = {}) => { calls.push({ url: _url, init }); return compactResponse(); };
        ctx.state.registry.llm.claudeFetch = async (_c: unknown, _s: unknown, o: { init: RequestInit }) => { captured.push(o.init); return compactResponse(); };
        await claude.compact(ctx, conn, { ...req, focus: "paths", maxTokens: 1000 });
        await ctx.fns.llm.compactAnthropic({ model: `anthropic-oauth:${req.model}`, instructions: req.instructions, messages: req.messages, focus: "paths", maxTokens: 1000 });
        expect(calls[1]!.init.body).toBe(captured[1]!.body); expect(normalizedHeaders(calls[1]!.init.headers)).toEqual(normalizedHeaders(captured[1]!.headers));
    });
});
