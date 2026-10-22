/**
 * Build verified OpenCode reasoning fields for the selected transport
 *
 * Use for OpenCode streaming and nonstream requests. Reads only cached catalog metadata, resolves the user preference, and emits only advertised effort values; other providers must not call this helper.
 * @param opts.model Provider-qualified OpenCode model route used to resolve the reasoning preference.
 * @param opts.modelId Exact authenticated catalog model identifier.
 * @param opts.api Resolved wire transport; must match the cached catalog entry.
 * @param opts.effort Requested reasoning preference; auto omits wire settings because metadata does not declare a default. @default auto
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider-qualified OpenCode model route used to resolve the reasoning preference. */
        model: string;
        /** Exact authenticated catalog model identifier. */
        modelId: string;
        /** Resolved wire transport; must match the cached catalog entry. */
        api: "openai" | "anthropic" | "responses";
        /** Requested reasoning preference; auto omits wire settings because metadata does not declare a default. @default auto */
        effort?: types.llm.ReasoningEffort;
    },
): Promise<{ reasoning_effort?: string; reasoning?: { effort: string }; thinking?: { type: "disabled" }; output_config?: { effort: string } }> {
    if (!opts.effort || opts.effort === "auto") return {};
    const catalog = await ctx.fns.llm.opencodeCatalog({ cachedOnly: true });
    const entry = catalog.models.find(model => model.id === opts.modelId && model.api === opts.api);
    if (!entry) return {};
    if (opts.api === "anthropic" && opts.effort === "off") {
        return entry.reasoningOptions.some(option => option.type === "toggle") ? { thinking: { type: "disabled" } } : {};
    }
    const resolved = await ctx.fns.llm.resolveReasoningEffort({ model: opts.model, effort: opts.effort ?? "auto" });
    const applied: string = resolved.applied;
    if (opts.api === "anthropic" && applied === "off") {
        return entry.reasoningOptions.some(option => option.type === "toggle") ? { thinking: { type: "disabled" } } : {};
    }
    const values = entry.reasoningOptions.find(option => option.type === "effort")?.values;
    if (!values?.length || applied === "auto") return {};
    const effort = applied === "off" ? "none" : applied === "xhigh" && !values.includes("xhigh") && values.includes("max") ? "max" : applied;
    if (!values.includes(effort)) return {};
    if (opts.api === "anthropic") return { output_config: { effort } };
    if (opts.api === "responses") return { reasoning: { effort } };
    return { reasoning_effort: effort };
}
