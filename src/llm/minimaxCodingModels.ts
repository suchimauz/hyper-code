/**
 * Discover model IDs advertised by the configured MiniMax M Plan endpoint
 *
 * Use to populate the MiniMax M Plan model selector from the authenticated Anthropic-compatible models endpoint. Returns no models without a configured key or when discovery fails. Advertised models are not a guarantee of plan entitlement; never probes the standard API or exposes credentials.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<string[]> {
    const apiKey = await ctx.fns.secrets.resolveSetting({ module: "llm", scopeType: "global", key: "minimaxCodingApiKey" });
    if (!apiKey) return [];
    try {
        // X-Api-Key is the only header this Anthropic-compatible gateway accepts.
        const res = await ctx.fns.llm.connectFetch({ url: "https://api.minimax.io/anthropic/v1/models", init: { headers: { "x-api-key": apiKey }, signal: AbortSignal.timeout(10000), redirect: "error" } });
        if (!res.ok) {
            await ctx.fns.procs.log.warn({ event: "llm.minimax.catalogue", msg: "MiniMax M Plan model discovery returned HTTP " + res.status });
            return [];
        }
        const body = await res.json() as { data?: Array<{ id?: string }> };
        return [...new Set((body.data ?? []).map(model => model.id).filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)))].sort();
    } catch (error) {
        await ctx.fns.procs.log.warn({ event: "llm.minimax.catalogue", msg: "MiniMax M Plan model discovery failed: " + (error instanceof Error ? error.name : "request error") });
        return [];
    }
}
