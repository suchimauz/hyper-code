/**
 * Stream one inference turn through a model connection's provider
 *
 * Inference entry point of the models stack. Re-checks on every call that the connection and model are enabled (models.assertModelEnabled; fails MODEL_DISABLED_BY_USER or CONNECTION_DISABLED without any network request), then calls the provider's stream operation with the connection bound to its saved transport. Fails UNSUPPORTED when the provider declares no stream. Returns text, reasoning summary, tool calls, usage and finish reason. Agents still use llm.stream; use this for models connections.
 * @param opts.connectionId Model connection UUID.
 * @param opts.model Provider-native model id on the connection.
 * @param opts.instructions Effective system instructions.
 * @param opts.messages OpenAI-shaped chat transcript.
 * @param opts.cacheableMessageCount Number of leading cacheable messages, excluding transient guidance. @minimum 0
 * @param opts.tools Wire tool schemas in the provider's API shape.
 * @param opts.reasoningEffort Reasoning effort such as low, medium, high or off.
 * @param opts.onEvent Receives incremental text, reasoning and tool-argument deltas.
 * @param opts.sessionId Stable session or agent id for caching and correlation.
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
        /** OpenAI-shaped chat transcript. */
        messages: Record<string, unknown>[];
        /** Number of leading cacheable messages, excluding transient guidance. @minimum 0 */
        cacheableMessageCount?: number;
        /** Wire tool schemas in the provider's API shape. */
        tools?: Record<string, unknown>[];
        /** Reasoning effort such as low, medium, high or off. */
        reasoningEffort?: string;
        /** Receives incremental text, reasoning and tool-argument deltas. */
        onEvent?: (event: types.models.StreamEvent) => void;
        /** Stable session or agent id for caching and correlation. */
        sessionId: string;
        /** Cancels the provider request. */
        signal?: AbortSignal;
    },
): Promise<types.models.StreamResult> {
    const view = await ctx.fns.models.assertModelEnabled({ id: opts.connectionId, model: opts.model });
        const def = Object.hasOwn(ctx.state.models?.providers ?? {}, view.provider) ? ctx.state.models!.providers![view.provider]!.definition : undefined;
        if (!def?.stream) throw Object.assign(new Error("Provider " + view.provider + " does not support stream"), { code: "UNSUPPORTED", status: 400, retryable: false });
        opts.signal?.throwIfAborted();
        const { definition, conn } = await ctx.fns.models.resolve({ id: view.id, signal: opts.signal, timeoutMs: 600000 });
        const { connectionId: _c, ...req } = opts;
        return await definition.stream!(ctx, conn, req);
}
