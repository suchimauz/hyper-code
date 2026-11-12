/** Built-in Codex (ChatGPT subscription) provider; every request, including login, uses the connection transport. */

const BASE = "https://chatgpt.com/backend-api";

type Auth = { token: string; accountId: string | null };

async function auth(ctx: Context, conn: types.models.ResolvedConnection): Promise<Auth> {
    const r = await ctx.fns.models.codexAuth({ conn, op: "token" });
    return { token: r.accessToken!, accountId: r.accountId };
}

/** HTTP errors before streaming: a 401 also flags the stored login; nothing is retried here. */
async function checked(ctx: Context, conn: types.models.ResolvedConnection, res: Response): Promise<Response> {
    if (res.ok) return res;
    const text = await res.text().catch(() => "");
    let error: Record<string, unknown> | null = null;
    try { const j = JSON.parse(text); error = (j?.error && typeof j.error === "object" ? j.error : j) as Record<string, unknown>; } catch { /* non-JSON body: classify by status */ }
    if (res.status === 401) await ctx.fns.models.codexAuth({ conn, op: "markLogin" });
    const f = ctx.fns.models.codexFailure({ phase: "http", status: res.status, error, retryAfter: res.headers.get("retry-after") });
    throw ctx.fns.models.failure(f);
}

async function responses(ctx: Context, conn: types.models.ResolvedConnection, a: Auth, sessionId: string, body: Record<string, unknown>, signal?: AbortSignal, extra: Record<string, string> = {}): Promise<Response> {
    const headers: Record<string, string> = {
        authorization: `Bearer ${a.token}`,
        ...(a.accountId ? { "chatgpt-account-id": a.accountId } : {}),
        originator: "codex_cli_rs",
        version: ctx.fns.models.codexVersion({ config: conn.config }),
        "OpenAI-Beta": "responses=experimental",
        accept: "text/event-stream",
        "content-type": "application/json",
        session_id: sessionId,
        "x-client-request-id": sessionId,
        ...extra,
    };
    if (signal?.aborted) throw ctx.fns.models.failure({ message: "Request cancelled before dispatch", status: 499, info: { code: "CANCELLED", classification: "cancelled", acceptance: "none", retryable: false, replaySafe: true } });
    let res: Response;
    try {
        res = await conn.fetch(`${BASE}/codex/responses`, { method: "POST", headers, body: JSON.stringify(body), signal });
    } catch (error) {
        throw interrupted(ctx, error, signal);
    }
    return checked(ctx, conn, res);
}

/** The request may already be accepted: report uncertain acceptance and never replay it automatically. */
function interrupted(ctx: Context, error: unknown, signal?: AbortSignal): Error {
    if ((error as { failure?: unknown })?.failure) return error as Error;
    if (signal?.aborted) return ctx.fns.models.failure({ message: "Codex request cancelled", status: 499, info: { code: "CANCELLED", classification: "cancelled", acceptance: "uncertain", retryable: false, replaySafe: false } });
    return ctx.fns.models.failure({ message: "Codex connection failed before a terminal response", status: 502, info: { code: "TRANSPORT", classification: "transport", acceptance: "uncertain", retryable: true, replaySafe: false } });
}

function streamFailed(ctx: Context, ev: Record<string, any>): Error {
    const error = (ev.response?.error ?? ev.error ?? (ev.code || ev.message ? { code: ev.code, message: ev.message } : null)) as Record<string, unknown> | null;
    return ctx.fns.models.failure(ctx.fns.models.codexFailure({ phase: "stream", status: 0, error }));
}

async function* events(ctx: Context, body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<Record<string, any>> {
    try {
        for await (const { data } of ctx.fns.models.parseSSE({ body })) {
            if (!data || data === "[DONE]") continue;
            let ev: unknown;
            try { ev = JSON.parse(data); } catch {
                throw ctx.fns.models.failure({ message: "Codex sent a malformed stream event", status: 502, info: { code: "PROVIDER_ERROR", classification: "provider", acceptance: "uncertain", retryable: false, replaySafe: false } });
            }
            if (ev && typeof ev === "object") yield ev as Record<string, any>;
        }
    } catch (error) {
        throw interrupted(ctx, error, signal);
    }
}

function parseArgs(raw: unknown): unknown {
    const buf = typeof raw === "string" ? raw : "";
    if (!buf.trim()) return {};
    try { return JSON.parse(buf); } catch { return { __unparsed: buf }; }
}

const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
function level(v: unknown): types.models.ReasoningLevel | null {
    const s = v === "none" ? "off" : v;
    return typeof s === "string" && (LEVELS as readonly string[]).includes(s) ? s as types.models.ReasoningLevel : null;
}
/** Reasoning metadata from model discovery, only when complete and consistent. */
function discoveredReasoning(m: { supported_reasoning_levels?: unknown; default_reasoning_level?: unknown }): types.models.ModelInfo["reasoning"] | undefined {
    if (!Array.isArray(m.supported_reasoning_levels)) return undefined;
    const supported = m.supported_reasoning_levels.map(x => level(typeof x === "string" ? x : (x as { effort?: unknown })?.effort));
    const def = level(m.default_reasoning_level);
    if (!supported.length || supported.some(x => !x) || !def || !supported.includes(def) || new Set(supported).size !== supported.length) return undefined;
    return { supported: supported as types.models.ReasoningLevel[], default: def };
}

function windowOf(w: Record<string, unknown> | undefined, label: string, now: number): NonNullable<types.models.UsageReport["windows"]>[number] | null {
    const used = Number(w?.used_percent);
    if (!w || !Number.isFinite(used)) return null;
    const direct = Number(w.resets_at ?? w.reset_at), after = Number(w.reset_after_seconds);
    const resetAt = Number.isFinite(direct) && direct > 0 ? direct * 1000 : Number.isFinite(after) ? now + after * 1000 : undefined;
    const minutes = Number.isFinite(Number(w.window_minutes)) ? Number(w.window_minutes) : Number.isFinite(Number(w.limit_window_seconds)) ? Number(w.limit_window_seconds) / 60 : NaN;
    const span = Number.isFinite(minutes) && minutes > 0 ? (minutes % 1440 === 0 ? `${minutes / 1440}d` : minutes % 60 === 0 ? `${minutes / 60}h` : `${Math.round(minutes)}m`) : "";
    return { label: span ? `${label} (${span})` : label, usedPercent: Math.max(0, Math.min(100, used)), ...(resetAt ? { resetAt } : {}) };
}

export default {
    id: "codex",
    label: "Codex",
    description: "ChatGPT subscription through the Codex backend. Log in with a device code; login and all requests use the selected transport.",
    icon: "Bot",
    fields: [
        { key: "clientVersion", label: "Client version", type: "text", help: "Optional Codex client version sent to the backend; defaults to the documented SDK version (models.codexVersion)." },
    ],
    transports: ["direct", "socks", "ssh-tunnel"],
    validate(_ctx, config) {
        if (config.clientVersion !== undefined && config.clientVersion !== "" && !/^[0-9A-Za-z.+-]{1,40}$/.test(String(config.clientVersion))) throw new Error("Client version must look like 0.98.0");
    },
    async test(ctx, conn) {
        const state = await ctx.fns.models.codexAuth({ conn, op: "status" });
        if (!state.loggedIn) return { status: "configured", reason: "login-required", message: "Log in to use this connection", checkedAt: Date.now() };
        try {
            const a = await auth(ctx, conn);
            const res = await conn.fetch(`${BASE}/codex/models?client_version=${encodeURIComponent(ctx.fns.models.codexVersion({ config: conn.config }))}`, { headers: { authorization: `Bearer ${a.token}`, originator: "codex_cli_rs" } });
            await (await checked(ctx, conn, res)).body?.cancel().catch(() => undefined);
            return { status: "available", reason: "models-ok", message: "Logged in; model list available", checkedAt: Date.now() };
        } catch (error) {
            const code = (error as { code?: unknown }).code;
            return code === "LOGIN_REQUIRED"
                ? { status: "unavailable", reason: "login-required", message: "Login expired; log in again", checkedAt: Date.now() }
                : { status: "unavailable", reason: "request-failed", message: "Codex backend request failed", checkedAt: Date.now() };
        }
    },
    async listModels(ctx, conn) {
        const a = await auth(ctx, conn);
        const res = await checked(ctx, conn, await conn.fetch(`${BASE}/codex/models?client_version=${encodeURIComponent(ctx.fns.models.codexVersion({ config: conn.config }))}`, { headers: { authorization: `Bearer ${a.token}`, originator: "codex_cli_rs" } }));
        const data = await res.json() as { models?: { slug?: unknown; display_name?: unknown; description?: unknown; visibility?: unknown; supported_in_api?: unknown; context_window?: unknown; supported_reasoning_levels?: unknown; default_reasoning_level?: unknown }[] };
        return (data.models ?? [])
            .filter(m => typeof m?.slug === "string" && m.visibility !== "hidden" && m.visibility !== "hide" && m.supported_in_api !== false)
            .map(m => {
                const reasoning = discoveredReasoning(m);
                return {
                id: m.slug as string,
                ...(typeof m.display_name === "string" ? { label: m.display_name } : {}),
                ...(typeof m.description === "string" ? { description: m.description } : {}),
                ...(typeof m.context_window === "number" ? { contextWindow: m.context_window } : {}),
                ...(reasoning ? { reasoning } : {}),
                };
            });
    },
    async usage(ctx, conn) {
        const a = await auth(ctx, conn);
        const res = await checked(ctx, conn, await conn.fetch(`${BASE}/wham/usage`, { headers: { authorization: `Bearer ${a.token}`, ...(a.accountId ? { "chatgpt-account-id": a.accountId } : {}), "user-agent": "codex-cli" } }));
        const data = await res.json() as { rate_limit?: Record<string, unknown>; rate_limits?: Record<string, unknown>[] };
        const detail = data.rate_limit ?? data.rate_limits?.find?.(x => x?.limit_id === "codex") ?? data.rate_limits?.[0];
        const now = Date.now();
        const windows = [
            windowOf((detail?.primary_window ?? detail?.primary) as Record<string, unknown> | undefined, "Session", now),
            windowOf((detail?.secondary_window ?? detail?.secondary) as Record<string, unknown> | undefined, "Weekly", now),
        ].filter((w): w is NonNullable<typeof w> => !!w);
        if (!windows.length) throw new Error("Codex usage response has no quota windows");
        return { status: "available", reason: "usage-ok", checkedAt: now, windows };
    },
    capabilities: { continuationState: true, checkpoints: true, reasoning: true },
    reasoningProfile: (ctx, model) => ctx.fns.models.codexReasoningProfile({ model }),
    async stream(ctx, conn, req) {
        const a = await auth(ctx, conn);
        const { input } = ctx.fns.models.codexInput({ messages: req.messages });
        // models.stream normalizes reasoning for this opted-in provider; direct callers must do the same.
        const applied = req.reasoning?.applied;
        if (!applied) throw ctx.fns.models.failure({ message: "Codex requires SDK-resolved reasoning (call through models.stream)", status: 400, info: { code: "CAPABILITY_UNAVAILABLE", classification: "capability_unavailable", acceptance: "none", retryable: false, replaySafe: true } });
        const body: Record<string, unknown> = {
            model: req.model, store: false, stream: true, instructions: req.instructions, input,
            text: { verbosity: "medium" }, prompt_cache_key: req.promptCacheKey || req.sessionId,
            reasoning: { effort: applied === "off" ? "none" : applied, summary: "auto" },
            ...(req.tools?.length ? { tools: req.tools, parallel_tool_calls: true } : {}),
        };
        // Sticky routing: replay the run's first x-codex-turn-state; a new run (or no runId) starts without one.
        const turnState = req.runId && req.state?.runId === req.runId ? req.state.data.turnState : undefined;
        const res = await responses(ctx, conn, a, req.sessionId, body, req.signal, turnState ? { "x-codex-turn-state": turnState } : {});
        const received = res.headers.get("x-codex-turn-state") || undefined;
        const kept = turnState ?? received;
        const state: types.models.ProviderState | undefined = req.runId && kept
            ? { provider: conn.provider, connectionId: conn.id, sessionId: req.sessionId, runId: req.runId, data: { turnState: kept } }
            : undefined;
        if (!res.body) throw interrupted(ctx, new Error("empty stream"), req.signal);
        let text = "", thinking = "", finishReason: string | null = null, terminal = false, rateLimits: Record<string, unknown> | null = null;
        const usage: types.models.StreamResult["usage"] = {};
        const toolCalls: types.models.StreamResult["toolCalls"] = [];
        for await (const ev of events(ctx, res.body, req.signal)) {
            const t = ev.type;
            if (ev.rate_limits && typeof ev.rate_limits === "object") rateLimits = ev.rate_limits;
            if (t === "response.output_text.delta" && typeof ev.delta === "string") { text += ev.delta; req.onEvent?.({ type: "text_delta", delta: ev.delta }); }
            else if (t === "response.reasoning_summary_text.delta" && typeof ev.delta === "string") { thinking += ev.delta; req.onEvent?.({ type: "thinking_delta", delta: ev.delta, visibility: "public_summary" }); }
            else if (t === "response.function_call_arguments.delta" && typeof ev.delta === "string") req.onEvent?.({ type: "tool_args_delta", delta: ev.delta, ...(typeof ev.item_id === "string" ? { id: ev.item_id } : {}) });
            else if (t === "response.output_item.done" && ev.item?.type === "function_call") toolCalls.push({ id: String(ev.item.call_id ?? ev.item.id), name: String(ev.item.name), args: parseArgs(ev.item.arguments) });
            else if (t === "response.completed" || t === "response.incomplete") {
                if (ev.response?.rate_limits && typeof ev.response.rate_limits === "object") rateLimits = ev.response.rate_limits;
                const u = ev.response?.usage;
                if (u) { usage.prompt_tokens = u.input_tokens; usage.completion_tokens = u.output_tokens; if (u.input_tokens_details?.cached_tokens !== undefined) usage.cache_read_tokens = u.input_tokens_details.cached_tokens; }
                const status = ev.response?.status;
                finishReason = status === "completed" ? (toolCalls.length ? "tool_calls" : "stop") : status === "incomplete" ? "length" : status ?? null;
                if (ev.response?.incomplete_details?.reason === "max_output_tokens") finishReason = "length";
                terminal = true;
                break;
            } else if (t === "response.failed" || t === "error") throw streamFailed(ctx, ev);
        }
        if (!terminal) throw interrupted(ctx, new Error("no terminal event"), req.signal);
        const quota = ctx.fns.models.codexQuota({ headers: res.headers, rateLimits });
        return { text, thinking, finishReason, usage, toolCalls, ...(state ? { state } : {}), ...(quota ? { quota } : {}) };
    },
    async compact(ctx, conn, req) {
        const a = await auth(ctx, conn);
        const converted = ctx.fns.models.codexInput({ messages: req.messages });
        const compaction = { trigger: "manual", reason: "user_requested", implementation: "remote", phase: "standalone_turn", strategy: "memento" };
        const turnMetadata = JSON.stringify({ session_id: req.sessionId, thread_id: req.sessionId, turn_id: crypto.randomUUID(), request_kind: "compaction", compaction });
        const body = {
            model: req.model, instructions: req.instructions || converted.instructions, input: [...converted.input, { type: "compaction_trigger" }],
            tools: [], tool_choice: "auto", parallel_tool_calls: false, reasoning: { effort: "medium", summary: "auto" }, store: false, stream: true, include: [],
            client_metadata: { session_id: req.sessionId, thread_id: req.sessionId, "x-codex-turn-metadata": turnMetadata },
        };
        const res = await responses(ctx, conn, a, req.sessionId, body, req.signal, { "x-codex-turn-metadata": turnMetadata });
        if (!res.body) throw interrupted(ctx, new Error("empty stream"), req.signal);
        const bad = (message: string) => ctx.fns.models.failure({ message, status: 502, info: { code: "PROVIDER_ERROR", classification: "provider", acceptance: "accepted", retryable: false, replaySafe: false } });
        let item: { id?: unknown; encrypted_content?: unknown } | null = null, responseId = "", completed = false;
        const usage = { prompt_tokens: 0, completion_tokens: 0 };
        for await (const ev of events(ctx, res.body, req.signal)) {
            if (ev.type === "response.output_item.done" && ev.item?.type === "compaction") { if (item) throw bad("Codex compaction returned multiple checkpoint items"); item = ev.item; }
            else if (ev.type === "response.completed") { completed = true; responseId = typeof ev.response?.id === "string" ? ev.response.id : typeof ev.response_id === "string" ? ev.response_id : ""; usage.prompt_tokens = Number(ev.response?.usage?.input_tokens ?? 0); usage.completion_tokens = Number(ev.response?.usage?.output_tokens ?? 0); break; }
            else if (ev.type === "response.failed" || ev.type === "error") throw streamFailed(ctx, ev);
        }
        if (!completed) throw interrupted(ctx, new Error("no terminal event"), req.signal);
        if (!item || typeof item.encrypted_content !== "string" || !item.encrypted_content) throw bad("Codex compaction returned no valid checkpoint item");
        if (!responseId) throw bad("Codex compaction completed without a response id");
        return { item: { type: "compaction", ...(typeof item.id === "string" && item.id ? { id: item.id } : {}), encrypted_content: item.encrypted_content }, responseId, usage };
    },
    actions: {
        login: { label: "Log in", run: async (ctx, conn) => ctx.fns.models.codexLogin({ conn, op: "start" }) },
        loginStatus: {
            label: "Login status",
            run: async (ctx, conn) => {
                const state = await ctx.fns.models.codexAuth({ conn, op: "status" });
                return { loggedIn: state.loggedIn, needsLogin: state.needsLogin, expiresAt: state.expiresAt, flow: await ctx.fns.models.codexLogin({ conn, op: "status" }) };
            },
        },
        cancelLogin: { label: "Cancel login", run: async (ctx, conn) => ctx.fns.models.codexLogin({ conn, op: "cancel" }) },
        logout: {
            label: "Log out",
            run: async (ctx, conn) => {
                await ctx.fns.models.codexLogin({ conn, op: "cancel" });
                const state = await ctx.fns.models.codexAuth({ conn, op: "clear" });
                return { loggedIn: state.loggedIn, needsLogin: state.needsLogin };
            },
        },
    },
} satisfies types.models.ProviderDefinition;
