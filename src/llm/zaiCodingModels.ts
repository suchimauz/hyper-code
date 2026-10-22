/**
 * Discover model IDs advertised by the configured Z.ai Coding Plan endpoint
 *
 * Use to populate the Z.ai Coding Plan model selector from the authenticated models endpoint. Returns no models without a configured key or when discovery fails. Advertised models are not a guarantee of plan entitlement; never probes the standard API or exposes credentials.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<string[]> {
    const apiKey = await ctx.fns.secrets.resolveSetting({ module: "llm", scopeType: "global", key: "zaiCodingApiKey" });
    if (!apiKey) return [];
    try {
        const res = await ctx.fns.llm.connectFetch({ url: "https://api.z.ai/api/coding/paas/v4/models", init: { headers: { authorization: "Bearer " + apiKey }, signal: AbortSignal.timeout(10000), redirect: "error" } });
        if (!res.ok) {
            await ctx.fns.procs.log.warn({ event: "llm.zai.catalogue", msg: "Z.ai Coding model discovery returned HTTP " + res.status });
            return [];
        }
        const body = await res.json() as { data?: Array<{ id?: string }> };
        return [...new Set((body.data ?? []).map(model => model.id).filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)))].sort();
    } catch (error) {
        await ctx.fns.procs.log.warn({ event: "llm.zai.catalogue", msg: "Z.ai Coding model discovery failed: " + (error instanceof Error ? error.name : "request error") });
        return [];
    }
}
