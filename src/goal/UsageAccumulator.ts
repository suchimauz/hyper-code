/** Pure run/goal-bound ledger. Counts are all null once incomplete or overflowed; requests retain deduplication evidence. */
export type UsageAccumulator = Readonly<{
    sourceAgentId: string;
    runId: string;
    rootAccountingAgentId: string;
    goalIdAtBoundary: string | null;
    quality: 'exact' | 'unknown' | 'unsupported';
    inputTokens: string | null;
    cachedInputTokens: string | null;
    outputTokens: string | null;
    requests: Readonly<Record<string, types.goal.UsageNormalized>>;
}>;
