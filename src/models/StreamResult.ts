/** Normalized streaming result; matches the legacy llm stream result shape. */
export type StreamResult = {
    text: string;
    thinking: string;
    /** stop, length, tool_calls or null when unknown. */
    finishReason: string | null;
    usage: { prompt_tokens?: number; completion_tokens?: number; cache_read_tokens?: number; cache_write_tokens?: number };
    toolCalls: { id: string; name: string; args: unknown }[];
};
