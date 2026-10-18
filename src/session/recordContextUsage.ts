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
        usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined;
    },
): Promise<{ idx: number }> {
    const usage = opts.usage;
    const prompt = usage?.prompt_tokens;
    const completion = usage?.completion_tokens;
    const valid = typeof prompt === 'number' && Number.isFinite(prompt) && prompt >= 0 && typeof completion === 'number' && Number.isFinite(completion) && completion >= 0;
    return ctx.fns.session.appendEvent({ id: opts.id, event: { type: 'context_usage', usage: valid ? { prompt_tokens: prompt, completion_tokens: completion } : null } });
}
