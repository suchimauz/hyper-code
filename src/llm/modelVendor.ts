/**
 * Return the vendor (model maker) of a model route, independent of the provider that serves it.
 *
 * The provider in a route is the access path (codex, claude-code, anthropic-oauth, opencode, openrouter…); the vendor is who made the model (anthropic, openai, google, moonshot, zai, minimax, alibaba, deepseek, meta, mistral, xai). Aggregators such as opencode, openrouter, groq, oneapi and MauzCode nodes serve many vendors, so the vendor is derived from the model ID first (an explicit `vendor/` prefix, then known family prefixes) and only then from a single-vendor provider. Returns `unknown` when nothing matches. Use for grouping, icons and search, never for routing.
 * @param opts.model Model route in any form accepted by llm.parseModelRoute.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Model route in any form accepted by llm.parseModelRoute. */
        model: string;
    },
): string {
    const parsed = ctx.fns.llm.parseModelRoute({ model: opts.model });
        // MauzCode node catalogue IDs are themselves routes ("codex/x:gpt-5"): judge the inner route.
        if (parsed.model.includes(":")) return ctx.fns.llm.modelVendor({ model: parsed.model });
        const id = parsed.model.toLowerCase();
        // Aggregators prefix the vendor themselves (openrouter "anthropic/claude-…", groq "openai/gpt-oss-…").
        const slash = id.indexOf("/");
        const named = slash > 0 ? id.slice(0, slash) : "";
        const aliases: Record<string, string> = { "meta-llama": "meta", moonshotai: "moonshot", "x-ai": "xai", "z-ai": "zai", zhipuai: "zai", mistralai: "mistral", qwen: "alibaba", "deepseek-ai": "deepseek", minimaxai: "minimax" };
        if (named) return aliases[named] ?? named;
        const byPrefix: Array<[RegExp, string]> = [
            [/^claude/, "anthropic"], [/^(gpt|o\d|chatgpt|codex|text-embedding|whisper|dall-e)/, "openai"],
            [/^(gemini|gemma)/, "google"], [/^grok/, "xai"], [/^(kimi|k\d)/, "moonshot"], [/^glm/, "zai"],
            [/^minimax/, "minimax"], [/^(qwen|qwq)/, "alibaba"], [/^deepseek/, "deepseek"], [/^(llama|meta-)/, "meta"],
            [/^(mistral|mixtral|codestral|devstral|magistral|ministral)/, "mistral"],
        ];
        for (const [re, vendor] of byPrefix) if (re.test(id)) return vendor;
        const owner: Record<string, string> = { codex: "openai", openai: "openai", "claude-code": "anthropic", anthropic: "anthropic", "anthropic-oauth": "anthropic", xai: "xai", gemini: "google", kimi: "moonshot", "kimi-coding": "moonshot", "zai-coding": "zai", "minimax-coding": "minimax" };
        return owner[parsed.provider] ?? "unknown";
}
