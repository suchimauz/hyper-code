/** Provider-neutral streaming inference request for models.stream and ProviderDefinition.stream. */
export type StreamRequest = {
    /** Provider-native model id on the connection. */
    model: string;
    /** Effective system instructions. */
    instructions: string;
    /** Ordered input: OpenAI-shaped chat messages (role/content/tool_calls/tool_call_id), optionally with native checkpoint entries at their history position. Checkpoint entries reach only providers declaring capabilities.checkpoints. */
    messages: (Record<string, unknown> | types.models.CheckpointEntry)[];
    /** Number of leading messages eligible for prompt caching, excluding transient guidance. @minimum 0 */
    cacheableMessageCount?: number;
    /** Wire tool schemas in the provider's API shape (Responses `function` tools for Codex). */
    tools?: Record<string, unknown>[];
    /** Reasoning preference such as auto, off, low, medium or high. Opted-in providers receive the normalized value in `reasoning`; this field keeps the caller's original value. */
    reasoningEffort?: string;
    /** Set by models.stream for providers declaring capabilities.reasoning: requested/applied reasoning resolved before inference. */
    reasoning?: types.models.ReasoningResolution;
    /** Stable session or agent id used for request correlation (and prompt caching when promptCacheKey is absent). */
    sessionId: string;
    /** Caller-chosen prompt cache identity, e.g. shared by sessions with inherited history. Falls back to sessionId. Session correlation is unaffected. */
    promptCacheKey?: string;
    /** Caller-owned logical run (turn) id. Required to submit or receive continuation state; use a new id per run. */
    runId?: string;
    /** Continuation state returned by the previous request of the same run; validated against provider, connection, session and run before any network request. */
    state?: types.models.ProviderState;
    /** Cancels the provider request. */
    signal?: AbortSignal;
    /** Receives incremental text, reasoning and tool-argument deltas. */
    onEvent?: (event: types.models.StreamEvent) => void;
};
