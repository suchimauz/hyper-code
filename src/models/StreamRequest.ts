/** Provider-neutral streaming inference request for models.stream and ProviderDefinition.stream. */
export type StreamRequest = {
    /** Provider-native model id on the connection. */
    model: string;
    /** Effective system instructions. */
    instructions: string;
    /** OpenAI-shaped chat transcript (role/content/tool_calls/tool_call_id). */
    messages: Record<string, unknown>[];
    /** Wire tool schemas in the provider's API shape (Responses `function` tools for Codex). */
    tools?: Record<string, unknown>[];
    /** Reasoning effort such as low, medium, high or off. */
    reasoningEffort?: string;
    /** Stable session or agent id used for prompt caching and request correlation. */
    sessionId: string;
    /** Cancels the provider request. */
    signal?: AbortSignal;
    /** Receives incremental text, reasoning and tool-argument deltas. */
    onEvent?: (event: types.models.StreamEvent) => void;
};
