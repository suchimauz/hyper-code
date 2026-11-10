// ctx.state.compaction — context compactors declared by `$compaction_<provider>.ts`
// files. `compaction.resolve` picks the agent's provider, then `default`.

export type State = {
    /** Provider name (e.g. codex, anthropic, claude-code, default) → compactor. */
    compactors?: Record<string, types.compaction.CompactorEntry>;
    /** Tokenizer key (encoding or HF repo) → loaded counter, pending load, or last failure time. */
    tokenizers?: Record<string, { count?: (text: string) => number; loading?: Promise<void>; failedAt?: number }>;
};
