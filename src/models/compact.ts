/**
 * Create a native compaction checkpoint through a model connection's provider
 *
 * Compaction entry point of the models stack. Applies the same per-call enabled checks as models.stream (no network request for a disabled model or connection), then calls the provider's compact operation through the connection transport. Fails UNSUPPORTED when the provider declares no compact. Returns the opaque checkpoint item callers must persist verbatim.
 * @param opts.connectionId Model connection UUID.
 * @param opts.model Provider-native model id on the connection.
 * @param opts.instructions Effective system instructions.
 * @param opts.messages OpenAI-shaped chat transcript.
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
        /** Stable session or agent id for caching and correlation. */
        sessionId: string;
        /** Cancels the provider request. */
        signal?: AbortSignal;
    },
): Promise<types.models.CompactResult> {
    const view = await ctx.fns.models.assertModelEnabled({ id: opts.connectionId, model: opts.model });
        const def = Object.hasOwn(ctx.state.models?.providers ?? {}, view.provider) ? ctx.state.models!.providers![view.provider]!.definition : undefined;
        if (!def?.compact) throw Object.assign(new Error("Provider " + view.provider + " does not support compact"), { code: "UNSUPPORTED", status: 400, retryable: false });
        opts.signal?.throwIfAborted();
        const { definition, conn } = await ctx.fns.models.resolve({ id: view.id, signal: opts.signal, timeoutMs: 600000 });
        const { connectionId: _c, ...req } = opts;
        return await definition.compact!(ctx, conn, req);
}
