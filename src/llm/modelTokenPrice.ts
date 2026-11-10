/**
 * Look up public pay-as-you-go USD prices per million tokens for model routes
 *
 * Resolve MauzCode model routes such as anthropic:claude-haiku-4-5 or claude-code:claude-sonnet-4-5 to models.dev public API list prices (input, output, cache read, cache write, USD per 1M tokens). Use to estimate session spend; for subscription providers this is an API-equivalent estimate, not a bill. Cached for six hours; unknown models map to null.
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
    const state = ctx.state as typeof ctx.state & { modelsDevPrices?: { at: number; data?: Record<string, { models?: Record<string, { cost?: Record<string, number> }> }>; pending?: Promise<void> } };
    const cache = state.modelsDevPrices ??= { at: 0 };
    if (!cache.at || Date.now() - cache.at > (cache.data ? 6 * 3600000 : 60000)) {
        cache.pending ??= (async () => {
            try {
                const r = await fetch('https://models.dev/api.json', { redirect: 'error', signal: AbortSignal.timeout(20000) });
                if (r.ok) cache.data = await r.json() as typeof cache.data;
            } catch { await ctx.fns.procs.log.warn({ event: 'llm.prices.unavailable', msg: 'models.dev prices unavailable; keeping last snapshot' }); }
            finally { cache.at = Date.now(); delete cache.pending; }
        })();
        await cache.pending;
    }
    const data = cache.data ?? {};
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
