/** Aggregate-only context footer data. No transcript, prompt, tool schema or reasoning text. */
export type ContextDetails = {
    /** Counts of durable readings. Partial metrics cover measured requests only; never interpret them as complete historical totals. */
    coverage?: { requests: number; tokenRequests: number; timedRequests: number; ttftRequests: number; cacheRequests: number; tools: number; timedTools: number };
    /** Estimates of next-request components; each rounded independently, not provider usage. */
    breakdown: { systemPrompt: number; toolDefinitions: number; messages: number } | null;
    /** Durable session totals. Null means not recorded, not zero. Timing is not inferred from event timestamps or retained telemetry windows. */
    session: { llmTimeMs: number | null; toolTimeMs: number | null; avgTtftMs: number | null; tokensPerSecond: number | null };
    /** Sum over measured requests belonging to this agent only (not ancestors). Coverage discloses missing history. Cache-hit ratio is 0–1 when known. */
    usage: { cacheWriteTokens?: number | null; requests: number; inputTokens: number | null; uncachedInputTokens: number | null; cachedInputTokens: number | null; outputTokens: number | null; cacheHitRatio: number | null;
        /** API-equivalent USD estimate at the current model's public list price over measured requests; null when the price is unknown. */
        costUsd?: number | null;
        /** Current model list price, USD per 1M tokens; null when unknown. */
        price?: { input: number; output: number; cacheRead: number | null; cacheWrite: number | null } | null };
};
