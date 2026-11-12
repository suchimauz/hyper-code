/** Normalized incremental inference event passed to StreamRequest.onEvent. */
export type StreamEvent =
    | { type: "text_delta"; delta: string }
    | { type: "thinking_delta"; delta: string; visibility: "public_summary" }
    | { type: "tool_args_delta"; delta: string; id?: string };
