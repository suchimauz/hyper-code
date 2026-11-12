/** Opaque provider compaction checkpoint; callers persist the item verbatim. */
export type CompactResult = {
    item: { type: "compaction"; id?: string; encrypted_content: string };
    responseId: string;
    usage: { prompt_tokens: number; completion_tokens: number };
};
