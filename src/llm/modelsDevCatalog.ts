/**
 * Return the shared models.dev catalogue snapshot, refreshed at most once per hour
 *
 * Fetch https://models.dev/api.json and keep one in-memory snapshot shared by price and display-name lookups. A background timer refreshes it every hour; callers always get the current snapshot immediately and never wait for an hourly refresh. Only a call with no snapshot yet (first use or after failures) awaits a fetch. On network failure the last snapshot is kept. Returns an empty object when nothing was ever loaded.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<Record<string, { name?: string; models?: Record<string, { name?: string; cost?: Record<string, number>; limit?: { context?: number; output?: number } }> }>> {
    type Catalog = Record<string, { name?: string; models?: Record<string, { name?: string; cost?: Record<string, number>; limit?: { context?: number; output?: number } }> }>;
        const state = ctx.state as typeof ctx.state & { modelsDevCatalog?: { data?: Catalog; pending?: Promise<void>; timer?: ReturnType<typeof setInterval> } };
        const cache = state.modelsDevCatalog ??= {};
        const refresh = () => cache.pending ??= (async () => {
            try {
                const r = await fetch('https://models.dev/api.json', { redirect: 'error', signal: AbortSignal.timeout(20000) });
                if (r.ok) cache.data = await r.json() as Catalog;
                else await ctx.fns.procs.log.warn({ event: 'llm.modelsDev.unavailable', msg: 'models.dev returned HTTP ' + r.status + '; keeping last snapshot' });
            } catch { await ctx.fns.procs.log.warn({ event: 'llm.modelsDev.unavailable', msg: 'models.dev unavailable; keeping last snapshot' }); }
            finally { delete cache.pending; }
        })();
        if (!cache.timer) {
            cache.timer = setInterval(() => { void refresh(); }, 3600000);
            cache.timer.unref?.();
        }
        if (!cache.data) await refresh();
        return cache.data ?? {};
}
