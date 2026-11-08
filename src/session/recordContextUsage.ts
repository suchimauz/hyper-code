/**
 * Persist the latest model request token usage without creating a visible assistant reply
 *
 * Call after every completed model response, including empty-text tool-only turns. Stores a hidden event and refreshes the agent live topic. Missing or invalid provider counts invalidate the previous reading rather than inventing a token count.
 * @param opts.id Agent whose completed model response is measured.
 * @param opts.usage Provider-reported request and completion token counts, or absent usage.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent whose completed model response is measured. */
        id: string;
        /** Provider-reported request and completion token counts, or absent usage. */
        usage: { prompt_tokens?: number; completion_tokens?: number; cache_read_tokens?: number; cache_write_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | null | undefined;
        /** Monotonic completed request duration and time to first content/reasoning delta, milliseconds. Absent for historical callers. */
        metrics?: { llmTimeMs: number; ttftMs: number | null };
    },
): Promise<{ idx: number }> {
    const usage = opts.usage;
    const prompt = usage?.prompt_tokens;
    const completion = usage?.completion_tokens;
    const valid = typeof prompt === 'number' && Number.isFinite(prompt) && prompt >= 0 && typeof completion === 'number' && Number.isFinite(completion) && completion >= 0;
    const finite = (n: number | null | undefined) => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
    const cached = finite(usage?.cache_read_tokens ?? usage?.prompt_tokens_details?.cached_tokens);
    return ctx.fns.session.appendEvent({ id: opts.id, event: { type: 'context_usage', usage: valid ? { prompt_tokens: prompt, completion_tokens: completion, cache_read_tokens: cached !== null && cached <= prompt ? cached : null, cache_write_tokens: finite(usage?.cache_write_tokens) } : null, metrics: opts.metrics ? { llmTimeMs: finite(opts.metrics.llmTimeMs), ttftMs: finite(opts.metrics.ttftMs) } : null } });
}
