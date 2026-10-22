/**
 * Returns the known input context window of a model in tokens
 *
 * Maps a provider-qualified model id to a conservative input context window (Claude 200K, Codex/GPT-5+ 272K, long-context families 1M, common open models 128K). Returns null when unknown. Use to derive auto-compaction thresholds as a fraction of the model window.
 * @param opts.model Provider-qualified model such as `claude-code:claude-opus-5` or `codex:gpt-5.6-sol`.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Provider-qualified model such as `claude-code:claude-opus-5` or `codex:gpt-5.6-sol`. */
        model: string;
    },
): Promise<number | null> {
    const identity = await ctx.fns.compaction.modelIdentity({ model: opts.model });
    if (!identity) return null;
    const id = identity.modelId.toLowerCase();
    const provider = identity.provider;
    // MiniMax M Plan: the M3 generation (M3, M3.1-Flash) has a 1M-token
    // window; the older M2.x line is a 204,800-token model. The M3 window is
    // the model limit, but 512K is the recommended working size, so the
    // conservative 512K is used for auto-compaction thresholds.
    if (provider === "minimax-coding") {
        if (/^minimax-m3/.test(id)) return 512_000;
        if (/^minimax-m2/.test(id)) return 204_800;
        return null;
    }
    if (/claude|opus|sonnet|haiku|fable/.test(id)) return 200_000;
    if (provider === "codex" || /^gpt-(5|6)|daybreak/.test(id)) return 272_000;
    if (/^gpt-4\.1|gemini/.test(id)) return 1_000_000;
    if (/kimi|deepseek|qwen|glm|grok/.test(id)) return 128_000;
    return null;
}
