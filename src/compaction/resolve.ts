/**
 * Selects the context compactor for a model
 *
 * Returns the `$compaction_<provider>` compactor registered for the model's provider, falling back to `$compaction_default`. Hyper routes allow native Codex and the exact Anthropic providers only when their cached catalogue API matches the native wire format. Use before compacting an agent context so provider-native strategies (such as Codex server checkpoints) win over the generic text summary.
 * @param opts.model Provider-qualified model such as `codex:gpt-5`, `codex/work:gpt-5` or `anthropic:claude-sonnet-4-5`.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Provider-qualified model such as `codex:gpt-5`, `codex/work:gpt-5` or `anthropic:claude-sonnet-4-5`. */
        model: string;
    },
): Promise<types.compaction.CompactorEntry & { fallback: boolean }> {
    const compactors = (ctx.state as any).compaction?.compactors as types.compaction.State["compactors"] ?? {};
    const identity = await ctx.fns.compaction.modelIdentity({ model: opts.model });
    // Never infer native support from a Claude-looking model name or API alone.
    const relayNative = identity && (
        (identity.provider === "codex" && identity.api === "responses") ||
        (["anthropic", "claude-code", "anthropic-oauth"].includes(identity.provider) && identity.api === "anthropic")
    );
    const provider = identity && (!identity.relay || relayNative) ? identity.provider : "";
    const own = provider ? compactors[provider] : undefined;
    if (own) return { ...own, fallback: false };
    const fallback = compactors.default;
    if (!fallback) throw new Error(`no compactor for ${provider || opts.model}: add $compaction_${provider || "default"}.ts`);
    return { ...fallback, fallback: true };
}
