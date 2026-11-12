/** Claude subscription provider. All network traffic uses the connection's allow-listed transport. */
const BASE = "https://api.anthropic.com";
const IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";
const MODELS = ["claude-haiku-4-5", "claude-sonnet-4-5", "claude-sonnet-4-6", "claude-sonnet-5", "claude-opus-4-5", "claude-opus-4-6", "claude-opus-4-8", "claude-opus-5", "claude-opus-5-5"];

async function headers(ctx: Context, conn: types.models.ResolvedConnection, compact = false, usage = false): Promise<Record<string, string>> {
    const auth = await ctx.fns.models.claudeAuth({ conn, op: "token" });
    const version = typeof conn.config.clientVersion === "string" && conn.config.clientVersion.trim() || await ctx.fns.llm.claudeCodeCliVersion({});
    const h: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${auth.accessToken}`, "user-agent": ctx.env.CLAUDE_CODE_USER_AGENT ?? `claude-cli/${version} (external, sdk-cli)` };
    if (!usage) Object.assign(h, { "anthropic-version": "2023-06-01", "anthropic-beta": compact ? "claude-code-20250219,oauth-2025-04-20,compact-2026-09-04" : ctx.env.CLAUDE_CODE_ANTHROPIC_BETA ?? "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14", "x-app": "cli", "anthropic-dangerous-direct-browser-access": "true", "x-client-request-id": crypto.randomUUID() });
    return h;
}

async function failure(ctx: Context, conn: types.models.ResolvedConnection, body: string, h: Headers, status?: number): Promise<never> {
    if (status === 401 || status === 403) await ctx.fns.models.claudeAuth({ conn, op: "markLogin" });
    const classified = ctx.fns.llm.classifyError({ provider: "anthropic-oauth", kind: "subscription", status, body, headers: h });
    // Provider bodies can echo credentials. Preserve machine classification and timing,
    // never export raw payloads or provider-controlled error text.
    const { raw: _raw, message: _message, ...safe } = classified;
    const info = { ...safe, message: `Claude request failed (${classified.code})` };
    throw Object.assign(new Error(info.message), { failure: info, code: info.code, retryable: info.retryable, noFallback: true });
}

async function request(ctx: Context, conn: types.models.ResolvedConnection, path: string, init: RequestInit): Promise<Response> {
    const res = await ctx.fns.models.claudeRequest({ conn, url: (ctx.env.CLAUDE_CODE_BASE_API_URL || BASE).replace(/\/+$/, "") + path, init });
    if (!res.ok) return failure(ctx, conn, await res.text(), res.headers, res.status);
    return res;
}

function windowOf(raw: { utilization?: number; resets_at?: string } | undefined, label: string): NonNullable<types.models.UsageReport["windows"]>[number] | undefined {
    if (!raw || typeof raw.utilization !== "number" || !Number.isFinite(raw.utilization)) return undefined;
    const resetAt = Date.parse(raw.resets_at ?? "");
    return { label, usedPercent: Math.max(0, Math.min(100, raw.utilization)), ...(Number.isFinite(resetAt) ? { resetAt } : {}) };
}

async function recordHeaders(ctx: Context, conn: types.models.ResolvedConnection, h: Headers): Promise<void> {
    const windows: NonNullable<types.models.UsageReport["windows"]> = [];
    for (const [key, label] of [["5h", "Session"], ["7d", "Weekly"]]) {
        const raw = h.get(`anthropic-ratelimit-unified-${key}-utilization`);
        if (raw === null || !Number.isFinite(Number(raw))) continue;
        const reset = h.get(`anthropic-ratelimit-unified-${key}-reset`);
        windows.push({ label: label!, usedPercent: Math.max(0, Math.min(100, Number(raw) * 100)), ...(reset !== null && Number.isFinite(Number(reset)) && Number(reset) > 0 ? { resetAt: Number(reset) * 1000 } : {}) });
    }
    if (!windows.length) return;
    const connection = await ctx.fns.models.get({ id: conn.id });
    await ctx.fns.models.cached({ connection, kind: "usage", reuse: false, run: async () => ({ status: "available", reason: "usage-headers", checkedAt: Date.now(), windows }) });
}

export default {
    id: "claude", label: "Claude", description: "Claude subscription with owner-managed OAuth login", icon: "sparkles",
    fields: [{ key: "clientVersion", label: "Client version", type: "text", required: false }],
    transports: ["direct", "socks", "ssh-tunnel"],
    validate(_ctx, config) {
        if (config.clientVersion !== undefined && config.clientVersion !== "" && !/^[0-9A-Za-z.+-]{1,40}$/.test(String(config.clientVersion))) throw new Error("Client version must look like 2.0.0");
    },
    async test(ctx, conn) {
        const state = await ctx.fns.models.claudeAuth({ conn, op: "status" });
        if (!state.loggedIn || state.needsLogin) return { status: state.expiresAt === null ? "configured" : "unavailable", reason: "login-required", message: "Log in to Claude", checkedAt: Date.now() };
        try {
            const res = await request(ctx, conn, "/api/oauth/usage", { headers: await headers(ctx, conn, false, true) });
            await res.body?.cancel();
            return { status: "available", reason: "usage-ok", message: "Logged in to Claude", checkedAt: Date.now() };
        } catch (error) {
            const code = (error as { code?: string }).code;
            return { status: "unavailable", reason: code === "LOGIN_REQUIRED" || code === "AUTH" ? "login-required" : "request-failed", message: "Claude connection check failed", checkedAt: Date.now() };
        }
    },
    async listModels() { return MODELS.map(id => ({ id })); },
    async usage(ctx, conn) {
        const h = await headers(ctx, conn, false, true);
        const res = await request(ctx, conn, "/api/oauth/usage", { headers: h });
        const data = await res.json() as { five_hour?: { utilization?: number; resets_at?: string }; seven_day?: { utilization?: number; resets_at?: string } };
        const windows = [windowOf(data.five_hour, "Session"), windowOf(data.seven_day, "Weekly")].filter((w): w is NonNullable<typeof w> => !!w);
        if (!windows.length) throw new Error("Claude usage response has no quota windows");
        let plan: string | undefined;
        try {
            const profile = await request(ctx, conn, "/api/oauth/profile", { headers: h });
            const p = await profile.json() as { organization?: { organization_type?: string } };
            const type = p.organization?.organization_type;
            plan = ({ claude_max: "Max", claude_pro: "Pro", claude_team: "Team", claude_enterprise: "Enterprise" } as Record<string, string>)[type ?? ""];
        } catch (error) {
            // Profile is optional; quota remains useful when this endpoint is unavailable.
            if (error instanceof Error && error.name === "AbortError") throw error;
        }
        return { status: "available", reason: "usage-ok", checkedAt: Date.now(), windows, ...(plan ? { plan } : {}) };
    },
    async stream(ctx, conn, req) {
        const instructions = req.instructions.startsWith(IDENTITY) ? req.instructions.slice(IDENTITY.length).trimStart() : req.instructions;
        const bootstrap = instructions ? [{ role: "user", content: instructions }, { role: "assistant", content: "Understood. Ready to act." }] : [];
        const convo = [...bootstrap, ...req.messages.filter(m => m.role !== "system")];
        const cacheableMessageCount = (req.cacheableMessageCount ?? req.messages.length) + bootstrap.length;
        const messages = ctx.fns.llm.toAnthropicMessages({ messages: convo, cacheableMessageCount });
        const mark = (message: typeof messages[number] | undefined) => {
            const block = message?.content?.[message.content.length - 1];
            if (block && typeof block === "object") block.cache_control = { type: "ephemeral" };
        };
        if (messages.length > 2 && messages[1]?.role === "assistant") mark(messages[1]);
        const body: Record<string, unknown> = { model: req.model, system: IDENTITY, messages, stream: true, max_tokens: 16384 };
        const reasoning = await ctx.fns.llm.resolveReasoningEffort({ model: `anthropic-oauth:${req.model}`, effort: req.reasoningEffort as types.llm.ReasoningEffort ?? "auto" });
        if (reasoning.mode === "anthropic-adaptive" && reasoning.applied !== "auto") {
            if (reasoning.applied !== "off") { body.thinking = { type: "adaptive" }; body.output_config = { effort: reasoning.applied === "xhigh" ? "max" : reasoning.applied }; }
            else if (!/(opus|sonnet)-5/.test(req.model)) body.thinking = { type: "disabled" };
        }
        if (req.tools?.length) body.tools = req.tools;
        const h = await headers(ctx, conn);
        if (messages[0]?.content?.[0]?.type === "compaction") h["anthropic-beta"] += ",compact-2026-09-04";
        const res = await request(ctx, conn, "/v1/messages", { method: "POST", headers: h, body: JSON.stringify(body), signal: req.signal });
        let text = "", thinking = "", stop: string | null = null, terminal = false;
        const usage: types.models.StreamResult["usage"] = {};
        const slots = new Map<number, { id: string; name: string; buf: string }>();
        const setUsage = (u: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined) => {
            if (!u) return;
            if (u.output_tokens != null) usage.completion_tokens = u.output_tokens;
            if (u.input_tokens != null || u.cache_read_input_tokens != null || u.cache_creation_input_tokens != null) {
                usage.prompt_tokens = u.input_tokens == null ? undefined : u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
                usage.cache_read_tokens = u.cache_read_input_tokens; usage.cache_write_tokens = u.cache_creation_input_tokens;
            }
        };
        try {
            if (!res.body) throw new Error("Claude response has no stream body");
            for await (const frame of ctx.fns.llm.parseSSE({ body: res.body })) {
                if (!frame.data || frame.data === "[DONE]") continue;
                const ev = JSON.parse(frame.data);
                const type = ev.type ?? frame.event;
                if (type === "error") await failure(ctx, conn, JSON.stringify(ev), res.headers);
                else if (type === "message_stop") terminal = true;
                else if (type === "message_start") setUsage(ev.message?.usage);
                else if (type === "message_delta") { if (ev.delta?.stop_reason) stop = ev.delta.stop_reason; setUsage(ev.usage); }
                else if (type === "content_block_start" && ev.content_block?.type === "tool_use") slots.set(Number(ev.index ?? 0), { id: ev.content_block.id ?? "", name: ev.content_block.name ?? "", buf: "" });
                else if (type === "content_block_delta") {
                    const d = ev.delta ?? {};
                    if (d.type === "text_delta" && typeof d.text === "string") { text += d.text; req.onEvent?.({ type: "text_delta", delta: d.text }); }
                    else if (d.type === "thinking_delta" && typeof d.thinking === "string") { thinking += d.thinking; req.onEvent?.({ type: "thinking_delta", delta: d.thinking, visibility: "public_summary" }); }
                    else if (d.type === "input_json_delta" && typeof d.partial_json === "string") {
                        const slot = slots.get(Number(ev.index ?? 0));
                        if (slot) { slot.buf += d.partial_json; req.onEvent?.({ type: "tool_args_delta", delta: d.partial_json, id: slot.id }); }
                    }
                }
            }
            if (!terminal) throw new Error("Anthropic stream ended without message_stop");
        } catch (error) {
            if (req.signal?.aborted || error && typeof error === "object" && "failure" in error) throw error;
            const code = error instanceof SyntaxError ? "PROXY_PROTOCOL" : "PROXY_CONNECTION_LOST";
            throw Object.assign(new Error(`${code}: invalid or interrupted Claude stream`, { cause: error }), { code, retryable: code === "PROXY_CONNECTION_LOST", noFallback: true });
        }
        const toolCalls = [...slots.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => {
            let args: unknown = {};
            if (s.buf.trim()) { try { args = JSON.parse(s.buf); } catch { args = { __unparsed: s.buf }; } }
            return { id: s.id, name: s.name, args };
        });
        await recordHeaders(ctx, conn, res.headers);
        return { text, thinking, finishReason: stop === "end_turn" || stop === "stop_sequence" ? "stop" : stop === "max_tokens" ? "length" : stop, usage, toolCalls };
    },
    async compact(ctx, conn, req) {
        const system = [{ type: "text", text: IDENTITY }];
        if (req.instructions.trim()) system.push({ type: "text", text: req.instructions });
        const messages = ctx.fns.llm.toAnthropicMessages({ messages: req.messages.filter(m => m.role !== "system") });
        const compaction: { type: string; instructions?: string } = { type: "summarize" };
        if (req.focus?.trim()) compaction.instructions = ("Summarize this conversation into a handoff checkpoint so another model can seamlessly continue: goal, progress, decisions, constraints, exact identifiers/paths/errors, and next steps.\n\nFocus: " + req.focus.trim()).slice(0, 16384);
        const body = { model: req.model, max_tokens: req.maxTokens ?? 32000, messages, compaction, system };
        const res = await request(ctx, conn, "/v1/messages", { method: "POST", headers: await headers(ctx, conn, true), body: JSON.stringify(body), signal: req.signal });
        const raw = await res.json() as { content?: { type: string; content?: string; signature?: string }[]; stop_reason?: string; usage?: { iterations?: { type: string; input_tokens?: number; output_tokens?: number }[] } };
        const block = raw.content?.find(b => b.type === "compaction");
        if (!block || typeof block.content !== "string" || !block.signature) throw new Error(`anthropic compaction returned no block (stop_reason ${raw.stop_reason})`);
        const iteration = raw.usage?.iterations?.find(i => i.type === "compaction");
        return { item: { type: "compaction", content: block.content, signature: block.signature }, responseId: "", stopReason: String(raw.stop_reason ?? ""), usage: { prompt_tokens: Number(iteration?.input_tokens ?? 0), completion_tokens: Number(iteration?.output_tokens ?? 0) } };
    },
    actions: {
        login: { label: "Log in", run: async (ctx, conn) => ctx.fns.models.claudeLogin({ conn, op: "start" }) },
        loginStatus: { label: "Login status", run: async (ctx, conn) => { const s = await ctx.fns.models.claudeAuth({ conn, op: "status" }); return { loggedIn: s.loggedIn, needsLogin: s.needsLogin, expiresAt: s.expiresAt, flow: await ctx.fns.models.claudeLogin({ conn, op: "status" }) }; } },
        submitLogin: { label: "Submit authorization code", run: async (ctx, conn, input) => {
            if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.code !== "string" || typeof input.flowId !== "string") throw new Error("Authorization code and flow id are required");
            return ctx.fns.models.claudeLogin({ conn, op: "submit", code: input.code, flowId: input.flowId });
        } },
        cancelLogin: { label: "Cancel login", run: async (ctx, conn) => ctx.fns.models.claudeLogin({ conn, op: "cancel" }) },
        logout: { label: "Log out", run: async (ctx, conn) => { await ctx.fns.models.claudeLogin({ conn, op: "cancel" }); const s = await ctx.fns.models.claudeAuth({ conn, op: "clear" }); return { loggedIn: s.loggedIn, needsLogin: s.needsLogin }; } },
    },
} satisfies types.models.ProviderDefinition;
