/**
 * Resolves the SSH egress instance chosen for a coding plan provider
 *
 * Reads the per-provider instance setting (llm.zaiCodingInstance / llm.minimaxCodingInstance) and normalizes it: an empty value or "local" means calls leave from this machine (null), anything else is the name of the SSH instance that should carry the traffic. Validation against the configured instances happens at the call site, which already has the instance list.
 * @param opts.provider Coding plan provider whose egress instance is resolved.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Coding plan provider whose egress instance is resolved. */
        provider: "zai-coding" | "minimax-coding";
    },
): Promise<{ instance: string | null }> {
    const key = opts.provider === "zai-coding" ? "zaiCodingInstance" : "minimaxCodingInstance";
    const raw = (await ctx.fns.settings.getString({ module: "llm", scopeType: "global", key })) ?? "";
    const value = raw.trim();
    if (!value || value === "local") return { instance: null };
    return { instance: value };
}
