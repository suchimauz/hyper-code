/** Built-in Codex (ChatGPT subscription) provider; every request, including login, uses the connection transport. */

const BASE = "https://chatgpt.com/backend-api";

type Auth = { token: string; accountId: string | null };

async function auth(ctx: Context, conn: types.models.ResolvedConnection): Promise<Auth> {
    const r = await ctx.fns.models.codexAuth({ conn, op: "token" });
    return { token: r.accessToken!, accountId: r.accountId };
}

async function version(ctx: Context, conn: types.models.ResolvedConnection): Promise<string> {
    const v = typeof conn.config.clientVersion === "string" ? conn.config.clientVersion.trim() : "";
    return v || await ctx.fns.llm.codexCliVersion({});
}

/** A 401 means the stored login no longer works; flag it and fail without retrying. */
async function checked(ctx: Context, conn: types.models.ResolvedConnection, res: Response, what: string): Promise<Response> {
    if (res.ok) return res;
    const text = await res.text().catch(() => "");
    if (res.status === 401) {
        await ctx.fns.models.codexAuth({ conn, op: "markLogin" });
        throw Object.assign(new Error("Codex login required: the backend rejected the access token"), { code: "LOGIN_REQUIRED", status: 409, retryable: false });
    }
    const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
    throw Object.assign(new Error(`Codex ${what} failed with HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ""}`), { code: "PROVIDER_ERROR", status: 502, retryable });
}

async function responses(ctx: Context, conn: types.models.ResolvedConnection, a: Auth, sessionId: string, body: Record<string, unknown>, signal?: AbortSignal, extra: Record<string, string> = {}): Promise<Response> {
    const headers: Record<string, string> = {
        authorization: `Bearer ${a.token}`,
        ...(a.accountId ? { "chatgpt-account-id": a.accountId } : {}),
        originator: "codex_cli_rs",
        version: await version(ctx, conn),
        "OpenAI-Beta": "responses=experimental",
        accept: "text/event-stream",
        "content-type": "application/json",
        session_id: sessionId,
        "x-client-request-id": sessionId,
        ...extra,
    };
    return checked(ctx, conn, await conn.fetch(`${BASE}/codex/responses`, { method: "POST", headers, body: JSON.stringify(body), signal }), "request");
}

function parseArgs(raw: unknown): unknown {
    const buf = typeof raw === "string" ? raw : "";
    if (!buf.trim()) return {};
    try { return JSON.parse(buf); } catch { return { __unparsed: buf }; }
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
        { key: "clientVersion", label: "Client version", type: "text", help: "Optional Codex client version sent to the backend; defaults to the detected codex CLI version." },
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
            const res = await conn.fetch(`${BASE}/codex/models?client_version=${encodeURIComponent(await version(ctx, conn))}`, { headers: { authorization: `Bearer ${a.token}`, originator: "codex_cli_rs" } });
            await (await checked(ctx, conn, res, "models request")).body?.cancel().catch(() => undefined);
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
        const res = await checked(ctx, conn, await conn.fetch(`${BASE}/codex/models?client_version=${encodeURIComponent(await version(ctx, conn))}`, { headers: { authorization: `Bearer ${a.token}`, originator: "codex_cli_rs" } }), "models request");
        const data = await res.json() as { models?: { slug?: unknown; display_name?: unknown; description?: unknown; visibility?: unknown; supported_in_api?: unknown; context_window?: unknown }[] };
        return (data.models ?? [])
            .filter(m => typeof m?.slug === "string" && m.visibility !== "hidden" && m.visibility !== "hide" && m.supported_in_api !== false)
            .map(m => ({
                id: m.slug as string,
                ...(typeof m.display_name === "string" ? { label: m.display_name } : {}),
                ...(typeof m.description === "string" ? { description: m.description } : {}),
                ...(typeof m.context_window === "number" ? { contextWindow: m.context_window } : {}),
            }));
    },
    async usage(ctx, conn) {
        const a = await auth(ctx, conn);
        const res = await checked(ctx, conn, await conn.fetch(`${BASE}/wham/usage`, { headers: { authorization: `Bearer ${a.token}`, ...(a.accountId ? { "chatgpt-account-id": a.accountId } : {}), "user-agent": "codex-cli" } }), "usage request");
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
    async stream(ctx, conn, req) {
        const a = await auth(ctx, conn);
        const { input } = ctx.fns.llm.toCodexInput({ messages: req.messages as never });
        const effort = req.reasoningEffort === "off" ? "none" : req.reasoningEffort;
        const body: Record<string, unknown> = {
            model: req.model, store: false, stream: true, instructions: req.instructions, input,
            text: { verbosity: "medium" }, prompt_cache_key: req.sessionId,
            ...(effort ? { reasoning: { effort, summary: "auto" } } : {}),
            ...(req.tools?.length ? { tools: req.tools, parallel_tool_calls: true } : {}),
        };
        const res = await responses(ctx, conn, a, req.sessionId, body, req.signal);
        if (!res.body) throw new Error("Codex returned an empty stream");
        let text = "", thinking = "", finishReason: string | null = null, terminal = false;
        const usage: types.models.StreamResult["usage"] = {};
        const toolCalls: types.models.StreamResult["toolCalls"] = [];
        for await (const { data } of ctx.fns.llm.parseSSE({ body: res.body })) {
            if (!data || data === "[DONE]") continue;
            let ev: Record<string, any>;
            try { ev = JSON.parse(data); } catch { continue; }
            const t = ev.type;
            if (t === "response.output_text.delta" && typeof ev.delta === "string") { text += ev.delta; req.onEvent?.({ type: "text_delta", delta: ev.delta }); }
            else if (t === "response.reasoning_summary_text.delta" && typeof ev.delta === "string") { thinking += ev.delta; req.onEvent?.({ type: "thinking_delta", delta: ev.delta, visibility: "public_summary" }); }
            else if (t === "response.function_call_arguments.delta" && typeof ev.delta === "string") req.onEvent?.({ type: "tool_args_delta", delta: ev.delta, ...(typeof ev.item_id === "string" ? { id: ev.item_id } : {}) });
            else if (t === "response.output_item.done" && ev.item?.type === "function_call") toolCalls.push({ id: String(ev.item.call_id ?? ev.item.id), name: String(ev.item.name), args: parseArgs(ev.item.arguments) });
            else if (t === "response.completed" || t === "response.incomplete") {
                const u = ev.response?.usage;
                if (u) { usage.prompt_tokens = u.input_tokens; usage.completion_tokens = u.output_tokens; if (u.input_tokens_details?.cached_tokens !== undefined) usage.cache_read_tokens = u.input_tokens_details.cached_tokens; }
                const status = ev.response?.status;
                finishReason = status === "completed" ? (toolCalls.length ? "tool_calls" : "stop") : status === "incomplete" ? "length" : status ?? null;
                if (ev.response?.incomplete_details?.reason === "max_output_tokens") finishReason = "length";
                terminal = true;
                break;
            } else if (t === "response.failed" || t === "error") {
                throw Object.assign(new Error(`Codex ${t}: ${String(ev.response?.error?.message ?? ev.error?.message ?? ev.message ?? ev.code ?? "unknown error").slice(0, 500)}`), { code: "PROVIDER_ERROR", retryable: false });
            }
        }
        if (!terminal) throw Object.assign(new Error("Codex stream ended without a terminal response"), { code: "PROVIDER_ERROR", retryable: false });
        return { text, thinking, finishReason, usage, toolCalls };
    },
    async compact(ctx, conn, req) {
        const a = await auth(ctx, conn);
        const converted = ctx.fns.llm.toCodexInput({ messages: req.messages as never });
        const compaction = { trigger: "manual", reason: "user_requested", implementation: "remote", phase: "standalone_turn", strategy: "memento" };
        const turnMetadata = JSON.stringify({ session_id: req.sessionId, thread_id: req.sessionId, turn_id: crypto.randomUUID(), request_kind: "compaction", compaction });
        const body = {
            model: req.model, instructions: req.instructions || converted.instructions, input: [...converted.input, { type: "compaction_trigger" }],
            tools: [], tool_choice: "auto", parallel_tool_calls: false, reasoning: { effort: "medium", summary: "auto" }, store: false, stream: true, include: [],
            client_metadata: { session_id: req.sessionId, thread_id: req.sessionId, "x-codex-turn-metadata": turnMetadata },
        };
        const res = await responses(ctx, conn, a, req.sessionId, body, req.signal, { "x-codex-turn-metadata": turnMetadata });
        if (!res.body) throw new Error("Codex compaction returned no stream");
        let item: { id?: unknown; encrypted_content?: unknown } | null = null, responseId = "";
        const usage = { prompt_tokens: 0, completion_tokens: 0 };
        for await (const frame of ctx.fns.llm.parseSSE({ body: res.body })) {
            if (!frame.data || frame.data === "[DONE]") continue;
            let ev: Record<string, any>;
            try { ev = JSON.parse(frame.data); } catch { continue; }
            if (ev.type === "response.output_item.done" && ev.item?.type === "compaction") { if (item) throw new Error("Codex compaction returned multiple checkpoint items"); item = ev.item; }
            else if (ev.type === "response.completed") { responseId = String(ev.response?.id ?? ev.response_id ?? ""); usage.prompt_tokens = Number(ev.response?.usage?.input_tokens ?? 0); usage.completion_tokens = Number(ev.response?.usage?.output_tokens ?? 0); }
            else if (ev.type === "response.failed" || ev.type === "error") throw new Error(`Codex compaction failed: ${String(ev.response?.error?.message ?? ev.error?.message ?? ev.message ?? ev.type).slice(0, 500)}`);
        }
        if (!item || typeof item.encrypted_content !== "string" || !item.encrypted_content) throw new Error("Codex compaction returned no checkpoint item");
        if (!responseId) throw new Error("Codex compaction stream closed before response.completed");
        return { item: { type: "compaction", ...(item.id ? { id: String(item.id) } : {}), encrypted_content: item.encrypted_content }, responseId, usage };
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
