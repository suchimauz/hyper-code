/** Opaque provider compaction checkpoint; callers persist the item verbatim. */
export type CompactResult = {
    item: { type: "compaction"; id?: string; encrypted_content: string }
        | { type: "compaction"; content: string; signature: string };
    responseId: string;
    /** Provider stop reason for native compaction, when reported. */
    stopReason?: string;
    usage: { prompt_tokens: number; completion_tokens: number };
    /** Portable SDK checkpoint wrapping `item`, added by models.compact for providers declaring capabilities.checkpoints. Replay it as a CheckpointEntry. */
    checkpoint?: types.models.Checkpoint;
};
