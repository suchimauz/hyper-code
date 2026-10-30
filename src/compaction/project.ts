/**
 * Resolve the effective transcript and explain any fallback from a compact checkpoint
 *
 * Use the same projection for request assembly, context estimates and compaction. Honors full versus compact mode, reads only the selected checkpoint, validates its source and tail offsets, and adapts provider-native checkpoints. Missing or incompatible checkpoints return the complete supplied history with a machine-readable fallback reason; no history or metadata is modified.
 * @param opts.model Target provider-qualified model route that will receive the transcript.
 * @param opts.messages Complete ordered history before applying the selected compact checkpoint.
 * @param opts.sleepContext Persisted compact-context metadata including mode, selected revision and generations.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Target provider-qualified model route that will receive the transcript. */
        model: string;
        /** Complete ordered history before applying the selected compact checkpoint. */
        messages: types.session.Message[];
        /** Persisted compact-context metadata including mode, selected revision and generations. */
        sleepContext?: Record<string, unknown> | null;
    },
): Promise<{ messages: types.session.Message[]; mode: "full" | "compact"; fallback: "missing_generation" | "missing_checkpoint" | "incompatible_checkpoint" | "invalid_boundary" | null; revision: number | null; tailStart: number | null; activatedAt: number | null }> {
    const sleep = ctx.fns.agent.normalizeSleepContext({ sleepContext: opts.sleepContext });
    const revision = sleep?.activeRevision ?? null;
    const full = (fallback: "missing_generation" | "missing_checkpoint" | "incompatible_checkpoint" | "invalid_boundary" | null) => ({ messages: opts.messages, mode: "full" as const, fallback, revision, tailStart: null, activatedAt: null });
    if (sleep?.mode !== "compact") return full(null);
    const generation = ctx.fns.agent.getSleepGeneration({ sleepContext: sleep, kind: "active" });
    if (!generation) return full("missing_generation");
    const stored = generation.contextAgentId
        ? await ctx.fns.session.getMessages({ id: String(generation.contextAgentId) })
        : generation.contextMessages;
    if (!Array.isArray(stored) || !stored.length) return full("missing_checkpoint");
    const checkpoint = ctx.fns.compaction.portable({ model: opts.model, producedBy: generation.model, messages: stored });
    if (!checkpoint?.length) return full("incompatible_checkpoint");
    const frontier = Number(generation.sourceOffset ?? generation.sourceFrontier);
    const tailStart = Number(generation.tailStart ?? generation.sourceOffset ?? generation.sourceFrontier);
    if (!Number.isSafeInteger(frontier) || !Number.isSafeInteger(tailStart) || tailStart < 0 || frontier < tailStart || frontier > opts.messages.length) return full("invalid_boundary");
    return { messages: [...checkpoint as types.session.Message[], ...opts.messages.slice(tailStart)], mode: "compact", fallback: null, revision, tailStart, activatedAt: Number(generation.activatedAt ?? 0) };
}
