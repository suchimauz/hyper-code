/** Requested versus applied reasoning, resolved by models.stream before inference for opted-in providers. */
export type ReasoningResolution = {
    /** Caller preference as submitted; omitted is reported as auto. Never written back to caller settings. */
    requested: types.models.ReasoningLevel | "auto";
    /** Level the provider must send. */
    applied: types.models.ReasoningLevel;
    /** Why applied differs from requested (fallback), or null. */
    fallbackReason: string | null;
    source: types.models.ReasoningCapabilities["source"];
    profile?: string;
};
