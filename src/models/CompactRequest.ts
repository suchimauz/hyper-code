/** Provider-neutral native compaction request for models.compact and ProviderDefinition.compact. */
export type CompactRequest = {
    /** Provider-native model id on the connection. */
    model: string;
    /** Effective instructions for the compacted transcript. */
    instructions: string;
    /** Ordered transcript to compact; may contain earlier native checkpoint entries for providers declaring capabilities.checkpoints. */
    messages: (Record<string, unknown> | types.models.CheckpointEntry)[];
    /** Optional handoff guidance identifying what the compacted context should preserve. */
    focus?: string;
    /** Provider output token budget for compaction. @minimum 1 */
    maxTokens?: number;
    /** Stable session or agent id. */
    sessionId: string;
    /** Cancels the provider request. */
    signal?: AbortSignal;
};
