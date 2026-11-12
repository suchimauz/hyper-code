/**
 * Map MauzCode model routes to human-readable model names such as Claude Opus 4.5
 *
 * Resolve routes like claude-code/default:claude-opus-4-5 or codex/me:gpt-5 to display names from the hourly models.dev catalogue (llm.modelsDevCatalog), trying the provider's models.dev alias first and then any provider. Suffixes such as (latest) are stripped. Unknown models fall back to a prettified ID (dashes to spaces, version digits joined with dots, words capitalised). Use for chat lists, headers and model pickers; never for routing.
 * @param opts.models MauzCode model routes or bare model IDs to name.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** MauzCode model routes or bare model IDs to name. */
        models: string[];
    },
): Promise<Record<string, string>> {
    const data = await ctx.fns.llm.modelsDevCatalog({});
        const alias: Record<string, string[]> = { 'claude-code': ['anthropic'], 'anthropic-oauth': ['anthropic'], anthropic: ['anthropic'], codex: ['openai'], openai: ['openai'], gemini: ['google'], google: ['google'], xai: ['xai'], groq: ['groq'], openrouter: ['openrouter'], kimi: ['moonshotai'], zai: ['zai'], opencode: ['opencode'] };
        const upper: Record<string, string> = { gpt: 'GPT', glm: 'GLM', ai: 'AI', oss: 'OSS', kimi: 'Kimi', o1: 'o1', o3: 'o3', o4: 'o4' };
        const pretty = (id: string) => id.replace(/(\d)-(?=\d(?:\D|$))/g, '$1.').split(/[-_]+/).filter(Boolean)
            .map(w => upper[w.toLowerCase()] ?? (/^\d/.test(w) ? w : w[0]!.toUpperCase() + w.slice(1))).join(' ')
            .replace(/^(GPT|GLM) (\d)/, '$1-$2');
        const clean = (n: string) => n.replace(/\s*\((latest|preview)\)\s*$/i, '').trim();
        const out: Record<string, string> = {};
        for (const route of opts.models) {
            const id = route.slice(route.lastIndexOf(':') + 1);
            const head = route.slice(0, Math.max(0, route.lastIndexOf(':')));
            const provider = (head.split(':').pop() ?? '').split('/')[0] ?? '';
            const bare = id.includes('/') ? id.split('/').pop()! : id;
            const candidates = [...(alias[provider] ?? (provider ? [provider] : [])), ...(id.includes('/') ? [id.split('/')[0]!] : [])];
            let name: string | undefined;
            for (const p of candidates) { name = data[p]?.models?.[id]?.name ?? data[p]?.models?.[bare]?.name; if (name) break; }
            if (!name) for (const p of ['anthropic', 'openai', 'google', 'xai', ...Object.keys(data)]) { name = data[p]?.models?.[bare]?.name; if (name) break; }
            out[route] = name ? clean(name) : (bare ? pretty(bare) : route);
        }
        return out;
}
