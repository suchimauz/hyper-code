/** Pure run/goal-bound ledger. Counters sum reported components only; partial quality and request evidence preserve missing observations. */
export type UsageAccumulator = Readonly<{
    sourceAgentId: string;
    runId: string;
    rootAccountingAgentId: string;
    goalIdAtBoundary: string | null;
    quality: 'exact' | 'partial' | 'unknown' | 'unsupported';
    inputTokens: string | null;
    cachedInputTokens: string | null;
    outputTokens: string | null;
    requests: Readonly<Record<string, types.goal.UsageNormalized>>;
}>;
