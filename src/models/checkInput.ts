/**
 * Validate SDK inference input before any provider network request
 *
 * Used by models.stream and models.compact after the enabled checks: fails CANCELLED for an already aborted signal; UNSUPPORTED when checkpoint entries or continuation state reach a provider that does not declare capabilities.checkpoints / continuationState; INVALID_INPUT for a malformed checkpoint, state without runId, or state/checkpoint bound to another provider, connection, session, run or model. Messages never echo opaque payloads.
 * @param opts.provider Registered provider id of the connection.
 * @param opts.connectionId Connection UUID.
 * @param opts.model Provider-native model id.
 * @param opts.sessionId Session correlation id.
 * @param opts.capabilities Provider capability opt-ins.
 * @param opts.messages Ordered input to inspect for checkpoint entries.
 * @param opts.runId Logical run id, when any.
 * @param opts.state Submitted continuation state, when any.
 * @param opts.signal Cancellation signal.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Registered provider id of the connection. */
        provider: string;
        /** Connection UUID. */
        connectionId: string;
        /** Provider-native model id. */
        model: string;
        /** Session correlation id. */
        sessionId: string;
        /** Provider capability opt-ins. */
        capabilities?: types.models.ProviderDefinition["capabilities"];
        /** Ordered input to inspect for checkpoint entries. */
        messages: (Record<string, unknown> | types.models.CheckpointEntry)[];
        /** Logical run id, when any. */
        runId?: string;
        /** Submitted continuation state, when any. */
        state?: types.models.ProviderState;
        /** Cancellation signal. */
        signal?: AbortSignal;
    },
): void {
    const invalid = (message: string) => ctx.fns.models.failure({ message, status: 400, info: { code: "INVALID_INPUT", classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true } });
    const unsupported = (message: string) => ctx.fns.models.failure({ message, status: 400, info: { code: "UNSUPPORTED", classification: "unsupported", acceptance: "none", retryable: false, replaySafe: true } });
    if (opts.signal?.aborted) throw ctx.fns.models.failure({ message: "Request cancelled before dispatch", status: 499, info: { code: "CANCELLED", classification: "cancelled", acceptance: "none", retryable: false, replaySafe: true } });
    if (!Array.isArray(opts.messages)) throw invalid("messages must be an array");
    if (opts.runId !== undefined && (typeof opts.runId !== "string" || !opts.runId || opts.runId.length > 200)) throw invalid("runId must be a nonempty string up to 200 characters");
    opts.messages.forEach((raw, index) => {
        const m = raw as Record<string, unknown>;
        if (m?.type !== "checkpoint") return;
        if (!opts.capabilities?.checkpoints) throw unsupported(`Provider ${opts.provider} does not accept checkpoint input`);
        const c = m.checkpoint as Partial<types.models.Checkpoint> | undefined;
        if (!c || c.kind !== "native-checkpoint" || c.version !== 1 || !c.payload || typeof c.payload !== "object" || Array.isArray(c.payload)) throw invalid(`Input ${index}: malformed checkpoint`);
        if (c.provider !== opts.provider || c.connectionId !== opts.connectionId || c.model !== opts.model) throw invalid(`Input ${index}: checkpoint belongs to another provider, connection or model`);
    });
    const s = opts.state;
    if (s === undefined) return;
    if (!opts.capabilities?.continuationState) throw unsupported(`Provider ${opts.provider} does not accept continuation state`);
    if (!s || typeof s !== "object" || !s.data || typeof s.data !== "object" || Array.isArray(s.data) || Object.values(s.data).some(v => typeof v !== "string")) throw invalid("Malformed continuation state");
    if (!opts.runId) throw invalid("Continuation state requires runId");
    if (s.provider !== opts.provider || s.connectionId !== opts.connectionId || s.sessionId !== opts.sessionId || s.runId !== opts.runId) throw invalid("Continuation state belongs to another provider, connection, session or run");
}
