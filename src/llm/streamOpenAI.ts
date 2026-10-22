/** Stream OpenAI-compatible chat completions, accepting SSE or a gateway JSON completion and preserving reported model metadata. */
/**
 * Stream an agent request through an OpenAI-compatible endpoint.
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
    usage: any;
    /** Model ID sent to the gateway, not a verified upstream identity. */
    requestedModel: string;
    /** Model ID reported by the gateway; null when omitted. */
    responseModel: string | null;
    toolCalls: { id: string; name: string; args: any }[];
}> {
    const { agent } = opts;
    const { system: sys, messages: convo } = await ctx.fns.agent.buildLlmRequest({ agent });
    const messages: any[] = [];
    if (sys) messages.push({ role: "system", content: sys });
    const ep = await ctx.fns.llm.resolveEndpoint({ model: agent.model });
    const wireMessages = ctx.fns.llm.toOpenAIMessages({ messages: convo });
    if ((ep.upstream ?? ep.provider) === "zai-coding") {
        // Reasoning is retained with the canonical tool-call JSON, so it survives
        // session saves and forks without leaking provider fields to other APIs.
        const assistantCalls = convo.filter(m => m.role === "assistant" && m.tool_calls?.length);
        let callTurn = 0;
        for (const message of wireMessages) {
            if (message.role !== "assistant" || !message.tool_calls?.length) continue;
            const source = assistantCalls[callTurn++];
            const reasoning = source?.tool_calls?.[0]?.reasoning_content;
            if (typeof reasoning === "string") message.reasoning_content = reasoning;
        }
    }
    messages.push(...wireMessages);

    const body: any = {
        model: ep.modelId,
        messages,
        stream: true,
        stream_options: { include_usage: true },
    };
    if ((ep.upstream ?? ep.provider) === "zai-coding" && /^glm-5\.3(?:-flashx?)?$/.test(ep.modelId)) {
        const reasoning = await ctx.fns.llm.resolveReasoningEffort({ model: agent.model, effort: agent.reasoningEffort ?? "auto" });
        body.thinking = { type: "enabled" };
        body.reasoning_effort = reasoning.applied === "xhigh" ? "max" : reasoning.applied;
    }
    if (ep.provider === "opencode") Object.assign(body, await ctx.fns.llm.opencodeReasoningBody({ model: agent.model, modelId: ep.modelId, api: "openai", effort: agent.reasoningEffort }));
    // OpenAI-compatible providers do not consistently accept OpenAI's cache
    // extension. Groq currently rejects prompt_cache_key with HTTP 400.
    if (ep.provider === "openai") body.prompt_cache_key = await ctx.fns.agent.cacheRoot({ agent });

    // Native function calls, in JSON protocol mode only (see agent.wireTools).
    const tools = ctx.fns.agent.wireTools({ agent, api: "openai" });
    if (tools.length) {
        body.tools = tools;
        body.parallel_tool_calls = true;
    }

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (ep.apiKey) headers["authorization"] = `Bearer ${ep.apiKey}`;

    const transport = ep.provider === "opencode" ? ctx.fns.llm.opencodeFetch : ctx.fns.llm.connectFetch;
    const res = await transport({ url: ep.url, ...(ep.provider === "opencode" ? { sessionId: agent.id } : {}), init: {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: opts.signal,
    } });
    if (!res.ok) throw new Error(ep.provider === "opencode" ? `opencode ${res.status}` : `${ep.provider} ${res.status}: ${await res.text()}`);
    if (!res.body) throw new Error("empty response body");

    let text = "";
    let thinking = "";
    let finishReason: string | null = null;
    let usage: any = undefined;
    let responseModel: string | null = null;
    let sawChoice = false;
    // Arguments arrive as a JSON string split across deltas, keyed by index —
    // the pieces are concatenated per slot and parsed once at the end.
    const slots: { id: string; name: string; buf: string }[] = [];

    // Some gateways ignore stream:true and return a complete JSON message.
    // Feeding that body to parseSSE silently discards it (no data: frames).
    async function* chunks(): AsyncGenerator<any> {
        if (/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(res.headers.get("content-type") ?? "")) {
            yield await res.json();
            return;
        }
        for await (const { data } of ctx.fns.llm.parseSSE({ body: res.body! })) {
            if (data === "[DONE]") break;
            try { yield JSON.parse(data); } catch { continue; }
        }
    }
    for await (const parsed of chunks()) {
        if (parsed.error) throw new Error(`${ep.provider} returned an error in completion response`);
        if (typeof parsed.model === "string") responseModel = parsed.model;
        if (parsed.usage) usage = parsed.usage;
        const choice = parsed.choices?.[0];
        if (!choice) continue;
        sawChoice = true;
        const delta = choice.delta ?? choice.message ?? {};
        if (typeof delta.content === "string" && delta.content.length > 0) {
            text += delta.content;
            opts.onEvent?.({ type: "text_delta", delta: delta.content });
        }
        const reasoning = delta.reasoning_content ?? delta.reasoning;
        if (typeof reasoning === "string" && reasoning.length > 0) {
            thinking += reasoning;
            opts.onEvent?.({ type: "thinking_delta", delta: reasoning });
        }
        for (const [position, tc] of (delta.tool_calls ?? []).entries()) {
            const i = Number(tc.index ?? position);
            if (!Number.isSafeInteger(i) || i < 0 || i > 1024) throw new Error(`${ep.provider} invalid tool call index`);
            const slot = (slots[i] ??= { id: "", name: "", buf: "" });
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) slot.name += tc.function.name;
            if (typeof tc.function?.arguments === "string") slot.buf += tc.function.arguments;
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    if (!sawChoice) throw new Error(`${ep.provider} returned no completion choices (expected SSE or JSON)`);
    const toolCalls = slots.filter(Boolean).map((s, index) => ({
        id: s.id, name: s.name, args: parseArgs(s.buf),
        ...((ep.upstream ?? ep.provider) === "zai-coding" && index === 0 && thinking ? { reasoning_content: thinking } : {}),
    }));
    return { text, thinking, finishReason, usage, toolCalls, requestedModel: ep.modelId, responseModel };
}

// Without strict decoding the arguments are best-effort JSON, and a truncated
// reply can end mid-object. A parse failure travels as an argument the schema
// will reject by name, rather than as an exception that kills the run.
function parseArgs(buf: string): any {
    if (!buf.trim()) return {};
    try { return JSON.parse(buf); } catch { return { __unparsed: buf }; }
}
