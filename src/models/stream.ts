/**
 * Stream one inference turn through a model connection's provider
 *
 * Inference entry point of the models stack. Re-checks on every call that the connection and model are enabled (models.assertModelEnabled; fails MODEL_DISABLED_BY_USER or CONNECTION_DISABLED without any network request), then calls the provider's stream operation with the connection bound to its saved transport. Fails UNSUPPORTED when the provider declares no stream. Before the provider runs (and before any network request) it validates SDK input with models.checkInput (cancellation, checkpoint identity, continuation-state binding to provider/connection/session/run) and, for providers declaring capabilities.reasoning, normalizes reasoningEffort with models.resolveReasoning from cached model metadata or the provider's documented profile. Returns text, reasoning summary, tool calls, token usage, finish reason and, when supported, run-scoped continuation state, quota observations and requested/applied reasoning. Agents still use llm.stream; use this for models connections.
 * @param opts.connectionId Model connection UUID.
 * @param opts.model Provider-native model id on the connection.
 * @param opts.instructions Effective system instructions.
 * @param opts.messages Ordered input: OpenAI-shaped chat messages and, for checkpoint-capable providers, checkpoint entries.
 * @param opts.cacheableMessageCount Number of leading cacheable messages, excluding transient guidance. @minimum 0
 * @param opts.tools Wire tool schemas in the provider's API shape.
 * @param opts.reasoningEffort Reasoning effort such as low, medium, high or off.
 * @param opts.onEvent Receives incremental text, reasoning and tool-argument deltas.
 * @param opts.sessionId Stable session or agent id for request correlation; prompt cache identity when promptCacheKey is absent.
 * @param opts.promptCacheKey Caller-owned prompt cache identity, e.g. shared by sessions with inherited history.
 * @param opts.runId Caller-owned logical run id; required for continuation state.
 * @param opts.state Continuation state returned by the previous request of the same run.
 * @param opts.signal Cancels the provider request.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Model connection UUID. */
        connectionId: string;
        /** Provider-native model id on the connection. */
        model: string;
        /** Effective system instructions. */
        instructions: string;
        /** Ordered input: OpenAI-shaped chat messages and, for checkpoint-capable providers, checkpoint entries. */
        messages: (Record<string, unknown> | types.models.CheckpointEntry)[];
        /** Number of leading cacheable messages, excluding transient guidance. @minimum 0 */
        cacheableMessageCount?: number;
        /** Wire tool schemas in the provider's API shape. */
        tools?: Record<string, unknown>[];
        /** Reasoning effort such as low, medium, high or off. */
        reasoningEffort?: string;
        /** Receives incremental text, reasoning and tool-argument deltas. */
        onEvent?: (event: types.models.StreamEvent) => void;
        /** Stable session or agent id for request correlation; prompt cache identity when promptCacheKey is absent. */
        sessionId: string;
        /** Caller-owned prompt cache identity, e.g. shared by sessions with inherited history. */
        promptCacheKey?: string;
        /** Caller-owned logical run id; required for continuation state. */
        runId?: string;
        /** Continuation state returned by the previous request of the same run. */
        state?: types.models.ProviderState;
        /** Cancels the provider request. */
        signal?: AbortSignal;
    },
): Promise<types.models.StreamResult> {
    const view = await ctx.fns.models.assertModelEnabled({ id: opts.connectionId, model: opts.model });
        const def = Object.hasOwn(ctx.state.models?.providers ?? {}, view.provider) ? ctx.state.models!.providers![view.provider]!.definition : undefined;
        if (!def?.stream) throw Object.assign(new Error("Provider " + view.provider + " does not support stream"), { code: "UNSUPPORTED", status: 400, retryable: false });
        ctx.fns.models.checkInput({ provider: view.provider, connectionId: view.id, model: opts.model, sessionId: opts.sessionId, capabilities: def.capabilities, messages: opts.messages, runId: opts.runId, state: opts.state, signal: opts.signal });
        let reasoning: types.models.ReasoningResolution | undefined;
        if (def.capabilities?.reasoning) {
            // Read the existing catalogue cache only; inference never triggers model discovery.
            const rows = await ctx.fns.procs.db.select({ sql: "SELECT models_cache FROM llm_connections WHERE id=?", params: [view.id] }) as { models_cache: unknown }[];
            const cache = typeof rows[0]?.models_cache === "string" ? JSON.parse(rows[0].models_cache) : rows[0]?.models_cache;
            const info = Array.isArray(cache) ? (cache as types.models.ModelInfo[]).find(m => m?.id === opts.model) : undefined;
            reasoning = ctx.fns.models.resolveReasoning({ model: opts.model, preference: opts.reasoningEffort, metadata: info?.reasoning ?? null, profile: def.reasoningProfile?.(ctx, opts.model) ?? null });
        }
        opts.signal?.throwIfAborted();
        const { definition, conn } = await ctx.fns.models.resolve({ id: view.id, signal: opts.signal, timeoutMs: 600000 });
        const { connectionId: _c, ...rest } = opts;
        const req: types.models.StreamRequest = reasoning ? { ...rest, reasoning } : rest;
        const result = await definition.stream!(ctx, conn, req);
        if (result.state && (!def.capabilities?.continuationState || result.state.provider !== view.provider || result.state.connectionId !== view.id || result.state.sessionId !== opts.sessionId || result.state.runId !== opts.runId)) delete result.state;
        return reasoning ? { ...result, reasoning } : result;
}
