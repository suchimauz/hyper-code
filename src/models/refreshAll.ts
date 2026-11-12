/**
 * Refresh the cached model list of every enabled connection whose provider supports discovery
 *
 * Use as the hourly background job of the models module (started by models/$start) or to refresh all caches at once. Runs connections sequentially through models.listModels with refresh; a failed discovery keeps that connection's previous cache. Returns per-connection counts and safe errors, never secrets.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    _opts: {},
): Promise<{ refreshed: number; failed: { id: string; error: string }[] }> {
    const providers = ctx.state.models?.providers ?? {};
    const connections = (await ctx.fns.models.list({})).filter(c => c.enabled && Object.hasOwn(providers, c.provider) && !!providers[c.provider]!.definition.listModels);
    let refreshed = 0;
    const failed: { id: string; error: string }[] = [];
    for (const c of connections) {
        try {
            const r = await ctx.fns.models.listModels({ id: c.id, refresh: true });
            if (r.error) failed.push({ id: c.id, error: r.error }); else refreshed++;
        } catch (error) {
            failed.push({ id: c.id, error: ctx.fns.models.safeMessage({ message: error, fallback: "Model discovery failed" }) });
        }
    }
    return { refreshed, failed };
}
