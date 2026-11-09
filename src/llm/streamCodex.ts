// OpenAI Responses API streamer for the ChatGPT subscription via Codex backend
// (`https://chatgpt.com/backend-api/codex/responses`). Auth is the JWT from
// ~/.codex/auth.json — refreshCodex() is called first to ensure freshness.
// Same return shape as streamOpenAI / streamAnthropic so the dispatcher in
// stream.ts can swap providers transparently.
/**
 * Stream OpenAI Responses into text, reasoning and native tool calls.
 * Use for Codex-compatible providers, including SSH subscriptions. Rejects partial
 * SSH responses and preserves explicit provider SSE auth/quota failure classification.
 * @param opts.agent Agent associated with the operation.
 * @param opts.signal Abort signal for cancelling the request.
 * @param opts.onEvent Callback invoked for each normalized stream event.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Agent associated with the operation. */ agent: types.agent.Agent;
        /** Abort signal for cancelling the operation. */ signal?: AbortSignal;
        /** Callback invoked for each streamed model event. */ onEvent?: (ev: any) => void },
): Promise<{
    text: string;
    thinking: string;
    finishReason: string | null;
    usage: { prompt_tokens?: number; completion_tokens?: number };
    toolCalls: { id: string; name: string; args: any }[];
}> {
    const { agent } = opts;
    const ep = await ctx.fns.llm.resolveEndpoint({ model: agent.model });
    // Through a Hyper node the bearer is our node token and the host adds the
    // ChatGPT account headers itself (docs/hyper-node.md).
    const viaNode = ep.provider === "hyper";
    const apiKey = viaNode || ep.provider === "opencode" || ep.ssh ? ep.apiKey : (await ctx.fns.llm.refreshCodex({ account: ep.account }) ?? ep.apiKey);
    const reasoning = await ctx.fns.llm.resolveReasoningEffort({ model: agent.model, effort: agent.reasoningEffort ?? "auto" });
    if (!apiKey && ep.provider !== "opencode") throw new Error("codex: no access_token (run /settings → login)");
    const accountId = viaNode || ep.provider === "opencode" || ep.ssh ? "" : extractAccountId(apiKey!);

    const { system: instructions, messages: convo } = await ctx.fns.agent.buildLlmRequest({ agent });
    const { input } = ctx.fns.llm.toCodexInput({ messages: convo as any });

    const body: any = {
        model: ep.modelId,
        store: false,
        stream: true,
        instructions,
        input,
        text: { verbosity: "medium" },
        prompt_cache_key: await ctx.fns.agent.cacheRoot({ agent }),
    };

    if (ep.provider === "opencode") {
        Object.assign(body, await ctx.fns.llm.opencodeReasoningBody({ model: agent.model, modelId: ep.modelId, api: "responses", effort: agent.reasoningEffort }));
    } else body.reasoning = { effort: reasoning.applied === "off" ? "none" : reasoning.applied, summary: "auto" };
    // Native function_call items, in JSON protocol mode only (agent.wireTools).
    const tools = ctx.fns.agent.wireTools({ agent, api: "responses" });
    if (tools.length) {
        body.tools = tools;
        body.parallel_tool_calls = true;
    }

    // ChatGPT backend occasionally returns 5xx / "upstream connect error"
    // before any bytes ship. Retry pre-stream with exponential backoff.
    // Sticky routing like the Codex CLI: the backend returns x-codex-turn-state on the
    // first response of a turn and expects it replayed on every later request of that
    // turn. Without it requests land on different backends and miss the prompt cache.
    // Stored on the run-scoped ctx, so a new run (turn) starts without a stale token.
    const turnCtx = ctx as Context & { codexTurnState?: { agentId: string; value: string } };
    const turnState = turnCtx.codexTurnState?.agentId === agent.id ? turnCtx.codexTurnState.value : undefined;
    const headers = {
        "authorization": `Bearer ${apiKey}`,
        ...(accountId ? { "chatgpt-account-id": accountId } : {}),
        "originator": "codex_cli_rs",
        "version": await ctx.fns.llm.codexCliVersion({}),
        "OpenAI-Beta": "responses=experimental",
        "accept": "text/event-stream",
        "content-type": "application/json",
        "session_id": agent.id,
        "x-client-request-id": agent.id,
        ...(turnState ? { "x-codex-turn-state": turnState } : {}),
    };
    const bodyJson = JSON.stringify(body);
    const ssh = ep.ssh ? { ...ep.ssh, provider: ep.ssh.provider } : undefined;
    // Exactly one provider request: retries and their durable events belong to agent.run.
    if ((ctx as Context & { goalRequestContext?: { authority?: types.goal.DelegationAuthority } }).goalRequestContext?.authority) await ctx.fns.goal.requestAuthorize({});
    opts.signal?.throwIfAborted();
    const res = ep.provider === "opencode" ? await ctx.fns.llm.opencodeFetch({ url: ep.url, sessionId: agent.id, init: { method: "POST", headers, body: bodyJson, signal: opts.signal } }) : ssh ? await ctx.fns.sshAccount.fetch({ ssh, url: ep.url, init: { method: "POST", headers, body: bodyJson, signal: opts.signal } }) : await ctx.fns.llm.connectFetch({ url: ep.url, init: { method: "POST", headers, body: bodyJson, signal: opts.signal } });
    if (!res.ok) {
        if (res.status === 401) await ctx.fns.llm.accountAuthHealth({ action: "mark", provider: ep.provider, account: ep.account });
        const info = ctx.fns.llm.classifyError({ provider: ep.provider, account: ep.quotaAccount ?? ep.account, kind: ep.kind,
            status: res.status, body: await res.text(), headers: res.headers });
        throw failure(info);
    }
    await ctx.fns.llm.accountAuthHealth({ action: "clear", provider: ep.provider, account: ep.account });
    const nextTurnState = res.headers.get("x-codex-turn-state");
    if (nextTurnState && !turnState && Object.hasOwn(ctx, "goalRequestContext")) turnCtx.codexTurnState = { agentId: agent.id, value: nextTurnState };
    if (!res.body) throw new Error("empty response body");

    let text = "";
    let thinking = "";
    let finishReason: string | null = null;
    const usage: { prompt_tokens?: number; completion_tokens?: number } = {};
    // The Responses API announces a call as an output ITEM and finishes it with
    // response.output_item.done — the arguments are complete there, so the
    // *.delta events only matter for showing progress.
    const toolCalls: { id: string; name: string; args: any }[] = [];
    // The backend reports how much of the plan window is spent on every OK
    // response. Capturing it here is what lets the UI warn before the wall
    // instead of after it.
    let rateLimits: any = null;

    let terminal = false;
    try {
    for await (const { data } of ctx.fns.llm.parseSSE({ body: res.body })) {
        if (!data || data === "[DONE]") continue;
        let ev: any;
        try { ev = JSON.parse(data); } catch (error) { if (ep.ssh) throw error; continue; }
        const t = ev.type;
        if (t === "response.output_text.delta" && typeof ev.delta === "string") {
            text += ev.delta;
            opts.onEvent?.({ type: "text_delta", delta: ev.delta });
        } else if (t === "response.reasoning_summary_text.delta" && typeof ev.delta === "string") {
            thinking += ev.delta;
            opts.onEvent?.({ type: "thinking_delta", delta: ev.delta, visibility: "public_summary" });
        } else if (t === "response.function_call_arguments.delta" && typeof ev.delta === "string") {
            opts.onEvent?.({ type: "tool_args_delta", delta: ev.delta, id: ev.item_id });
        } else if (t === "response.output_item.done" && ev.item?.type === "function_call") {
            toolCalls.push({ id: ev.item.call_id ?? ev.item.id, name: ev.item.name, args: parseArgs(ev.item.arguments) });
        } else if (t === "response.completed" || t === "response.incomplete") {
            rateLimits = ev.response?.rate_limits ?? ev.rate_limits ?? rateLimits;
            const u = ev.response?.usage;
            if (u) {
                usage.prompt_tokens = u.input_tokens;
                usage.completion_tokens = u.output_tokens;
                (usage as any).cache_read_tokens = u.input_tokens_details?.cached_tokens;
            }
            finishReason = mapStop(ev.response?.status);
            const stop = ev.response?.incomplete_details?.reason;
            if (stop === "max_output_tokens") finishReason = "length";
            terminal = true;
            break;
        } else if (t === "response.failed" || t === "error") {
            if (ep.ssh) {
                const info = ctx.fns.llm.classifyError({
                    provider: ep.provider, account: ep.quotaAccount ?? ep.account, kind: ep.kind,
                    body: JSON.stringify({ error: ev.response?.error ?? ev.error ?? { code: ev.code, message: ev.message } }), headers: res.headers,
                });
                throw failure(info);
            }
            const msg =
                ev.response?.error?.message ??
                ev.error?.message ??
                ev.message ??
                ev.code ??
                JSON.stringify(ev);
            throw new Error(`codex ${t}: ${msg}`);
        }
    }

    if (ep.ssh && !terminal) throw new Error("Codex stream ended without a terminal response");
    } catch (error) {
        // A provider's terminal refusal is not an interrupted SSH inference.
        if (error && typeof error === 'object' && 'failure' in error) throw error;
        if (ep.ssh && !opts.signal?.aborted) {
            throw Object.assign(new Error("SSH inference interrupted; provider acceptance is uncertain. Resume manually.", { cause: error }), {
                transportFailure: { kind: "ssh_transport", phase: "ambiguous", retryable: false },
            });
        }
        throw error;
    }

    // Recording is a side effect of work already done: never its own request,
    // and never a reason to fail a completed turn.
    ctx.fns.llm.recordUsage?.({ provider: ep.provider, account: ep.account, headers: res.headers, rateLimits })
        ?.catch(() => undefined);
    return { text, thinking, finishReason, usage, toolCalls };
}

// strict:true makes these schema-valid, but a truncated reply can still end
// mid-object. A parse failure travels as an argument the schema will reject by
// name, not as a thrown run.
function parseArgs(raw: unknown): any {
    const buf = typeof raw === "string" ? raw : "";
    if (!buf.trim()) return {};
    try { return JSON.parse(buf); } catch { return { __unparsed: buf }; }
}

function isRetryable(status: number, body: string): boolean {
    if (status === 429 || status === 408) return true;
    if (status >= 500 && status <= 599) return true;
    return /upstream\s+connect|connection\s+(?:was\s+)?(?:reset|termination|refused|closed)|service\s+unavailable|overloaded|rate.?limit/i.test(body);
}

// Carry the classification on the Error itself: agent.workerLoop reads
// `error.failure` to decide between parking, retrying and giving up, without
// re-parsing a message string.
function failure(info: types.llm.FailureInfo): Error {
    const error = new Error(info.message);
    (error as any).failure = info;
    return error;
}

function mapStop(status: string | undefined): string | null {
    if (!status) return null;
    if (status === "completed") return "stop";
    if (status === "incomplete") return "length";
    if (status === "failed" || status === "cancelled") return status;
    return status;
}

function extractAccountId(token: string): string {
    try {
        const payload = token.split(".")[1];
        if (!payload) throw new Error("no payload");
        const json = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
        const id = json?.["https://api.openai.com/auth"]?.chatgpt_account_id;
        if (!id) throw new Error("no chatgpt_account_id");
        return id;
    } catch (e: any) {
        throw new Error(`codex: cannot read account id from token: ${e?.message}`);
    }
}
