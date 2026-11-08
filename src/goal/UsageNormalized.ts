/** Per-request counts: inclusive input, cached input, and output; exact only when every component is known. */
export type UsageNormalized = types.goal.UsageBinding & Readonly<{
    format: string;
    quality: 'exact' | 'partial' | 'unknown' | 'unsupported';
    reason: string | null;
    inputTokens: string | null;
    cachedInputTokens: string | null;
    outputTokens: string | null;
}>;
