/**
 * Reports supported reasoning effort levels for a model route
 *
 * Return the safe reasoning effort choices, default and provider wire mode for a concrete provider/account/model route. Use when rendering controls and before constructing an LLM request.
 * Hyper routes use the enabled node's cached catalogue identity, without fetching credentials or contacting the node. Missing, ambiguous or inconsistent entries return no reasoning capability.
 * @param opts.model Concrete model route in provider[/account]:modelId form, including hyper/node:provider/account:modelId.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Concrete model route in provider[/account]:modelId form. */
        model: string;
    },
): Promise<types.llm.ReasoningProfile> {
    const model = String(opts.model ?? "");
    const m = /^([a-z][\w-]*)(?:\/([\w.-]+))?:(.+)$/.exec(model);
    let provider = m?.[1] ?? "lmstudio";
    let rawModelId = m?.[3] ?? model;
    if (provider === 'ssh') {
        const route = /^(codex|claude-code)\/[\w.-]+:(.+)$/.exec(rawModelId);
        if (!route) return {supported:['auto','off'],defaultEffort:'off',mode:'none'};
        provider = route[1]!; rawModelId = route[2]!;
    }
    if (provider === "hyper") {
        const unavailable: types.llm.ReasoningProfile = { supported: ["auto", "off"], defaultEffort: "off", mode: "none" };
        // Only cached metadata is needed: capability controls must not read tokens
        // or trigger network/auth refreshes. Never infer trust from the route text.
        let node: types.node.NodeEntry | null;
        try { node = await ctx.fns.node.get({ name: m?.[2] ?? "default" }); }
        catch { return unavailable; }
        if (!node?.enabled || !Array.isArray(node.catalog)) return unavailable;
        let matches = node.catalog.filter((entry) => entry.id === rawModelId);
        if (!matches.length && !rawModelId.includes(":")) {
            matches = node.catalog.filter((entry) => entry.id.slice(entry.id.indexOf(":") + 1) === rawModelId);
        }
        if (matches.length !== 1) return unavailable;
        const entry = matches[0]!;
        const identity = /^([a-z][\w-]*)\/([\w.-]+):(.+)$/.exec(entry.id);
        if (entry.id.includes(":") && (!identity || identity[1] !== entry.provider || identity[2] !== entry.account)) return unavailable;
        if (entry.provider === "hyper") return unavailable;
        provider = entry.provider;
        rawModelId = identity?.[3] ?? entry.id;
    }
    const modelId = rawModelId.toLowerCase();
    // GLM-5.3 and Flash share low/high/max; reasoning cannot be disabled.
    // xhigh is Hyper's existing user-facing Max choice, mapped on the wire.
    if (provider === "zai-coding" && /^glm-5\.3(?:-flashx?)?$/.test(modelId)) {
        return { supported: ["auto", "low", "high", "xhigh"], defaultEffort: "xhigh", mode: "openai-effort" };
    }
    // gpt-6 family rejects effort "none"/"minimal": only low..max on the wire.
    if ((provider === "codex" || provider === "openai") && /^gpt-6/.test(modelId)) {
        return { supported: ["auto", "low", "medium", "high", "xhigh"], defaultEffort: "medium", mode: "openai-effort" };
    }
    if (provider === "codex" || (provider === "openai" && /^gpt-5/.test(modelId))) {
        const xhigh = /gpt-5\.[2-9]|codex-max|5\.6/.test(modelId);
        return { supported: ["auto", "off", "minimal", "low", "medium", "high", ...(xhigh ? ["xhigh" as const] : [])], defaultEffort: "medium", mode: "openai-effort" };
    }
    if (provider === "xai" && /^grok-4(?:\.|$)/.test(modelId)) {
        return { supported: ["auto", "off", "minimal", "low", "medium", "high", "xhigh"], defaultEffort: "medium", mode: "openai-effort" };
    }

    // Claude 5: adaptive thinking is always on (the API rejects thinking.type "disabled"), only its effort is
    // chosen — low…max. "auto" sends no effort and lets the model decide, as before levels existed.
    if ((provider === "claude-code" || provider === "anthropic-oauth" || provider === "anthropic") && /(opus|sonnet)-5/.test(modelId)) {
        const max = /opus-5/.test(modelId);
        return { supported: ["auto", "low", "medium", "high", ...(max ? ["xhigh" as const] : [])], defaultEffort: "off", mode: "anthropic-adaptive" };
    }
    if ((provider === "claude-code" || provider === "anthropic-oauth" || provider === "anthropic") && /(opus|sonnet)-4-6/.test(modelId)) {
        const max = /opus-4-6/.test(modelId);
        return { supported: ["auto", "off", "low", "medium", "high", ...(max ? ["xhigh" as const] : [])], defaultEffort: "medium", mode: "anthropic-adaptive" };
    }
    return { supported: ["auto", "off"], defaultEffort: "off", mode: "none" };
}
