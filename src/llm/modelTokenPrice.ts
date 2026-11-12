/**
 * Look up public pay-as-you-go USD prices per million tokens for model routes
 *
 * Resolve MauzCode model routes such as anthropic:claude-haiku-4-5 or claude-code:claude-sonnet-4-5 to models.dev public API list prices (input, output, cache read, cache write, USD per 1M tokens). Use to estimate session spend; for subscription providers this is an API-equivalent estimate, not a bill. Uses the shared models.dev snapshot from llm.modelsDevCatalog (refreshed hourly); unknown models map to null.
 * @param opts.models Exact MauzCode model routes <provider>:<modelId> to price.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact MauzCode model routes <provider>:<modelId> to price. */
        models: string[];
    },
): Promise<Record<string, { input: number; output: number; cacheRead: number | null; cacheWrite: number | null } | null>> {
    type Cost = { input: number; output: number; cacheRead: number | null; cacheWrite: number | null };
    const data = await ctx.fns.llm.modelsDevCatalog({});
    const out: Record<string, Cost | null> = {};
    const alias: Record<string, string[]> = { 'claude-code': ['anthropic'], 'anthropic-oauth': ['anthropic'], anthropic: ['anthropic'], codex: ['openai'], openai: ['openai'], gemini: ['google'], google: ['google'], xai: ['xai'], groq: ['groq'], openrouter: ['openrouter'], kimi: ['moonshotai'], zai: ['zai'] };
    const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
    for (const route of opts.models) {
        const parts = route.split(':');
        const id = parts[parts.length - 1] ?? '';
        const provider = (parts[parts.length - 2] ?? '').split('/')[0] ?? '';
        const bare = id.includes('/') ? id.split('/').pop()! : id;
        const candidates = [...(alias[provider] ?? [provider]), ...(id.includes('/') ? [id.split('/')[0]!] : [])];
        let cost: Record<string, number> | undefined;
        for (const p of candidates) { cost = data[p]?.models?.[id]?.cost ?? data[p]?.models?.[bare]?.cost; if (cost) break; }
        if (!cost) for (const p of ['anthropic', 'openai', 'google', 'xai', ...Object.keys(data)]) { cost = data[p]?.models?.[bare]?.cost; if (cost) break; }
        const input = num(cost?.input), output = num(cost?.output);
        out[route] = input !== null && output !== null ? { input, output, cacheRead: num(cost?.cache_read), cacheWrite: num(cost?.cache_write) } : null;
    }
    return out;
}
