/**
 * List a connection's models from its persistent cache, refreshing from the provider on demand
 *
 * Use to fill model pickers for one connection. The provider's model list is cached in Postgres per connection and never expires: without `refresh` the cached list is returned without network access; the provider is asked only when `refresh` is true (the "Update models" button and the hourly models.refreshAll) or when nothing is cached yet. A successful discovery (sanitized, de-duplicated) replaces the cache; a failed one keeps the previous cache and reports `error`. Without a cache and without a provider list, or for a disabled connection, returns the manual `config.models` ids. `source` says which list was returned, `cachedAt` is when the provider list was fetched. Every model carries `disabled: true` when the owner disabled it on this connection (models.setModelEnabled); disabled models stay listed. Disabled connections never touch the network.
 * @param opts.id Connection UUID.
 * @param opts.refresh Ask the provider now and update the cache. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Ask the provider now and update the cache. */
        refresh?: boolean;
    },
): Promise<{ models: types.models.ModelInfo[]; source: "provider" | "manual"; cachedAt: number | null; error?: string }> {
    const view = await ctx.fns.models.get({ id: opts.id });
    const off = new Set(view.disabledModels);
    const mark = (models: types.models.ModelInfo[]) => models.map(m => ({ ...m, disabled: off.has(m.id) }));
    const manual: types.models.ModelInfo[] = (Array.isArray(view.config.models) ? view.config.models : []).filter((m): m is string => typeof m === "string" && !!m).map(id => ({ id }));
    const def = Object.hasOwn(ctx.state.models?.providers ?? {}, view.provider) ? ctx.state.models!.providers![view.provider]!.definition : undefined;
    const rows = await ctx.fns.procs.db.select({ sql: "SELECT models_cache, models_cached_at FROM llm_connections WHERE id=?", params: [view.id] }) as { models_cache: unknown; models_cached_at: unknown }[];
    const rawCache = typeof rows[0]?.models_cache === "string" ? JSON.parse(rows[0].models_cache) : rows[0]?.models_cache;
    const cache = Array.isArray(rawCache) ? (rawCache as types.models.ModelInfo[]).filter(m => m && typeof m.id === "string") : null;
    const cachedAt = cache && rows[0]?.models_cached_at != null ? Number(rows[0].models_cached_at) : null;
    const fallback = (error?: string) => cache
        ? { models: mark(cache), source: "provider" as const, cachedAt, ...(error ? { error } : {}) }
        : { models: mark(manual), source: "manual" as const, cachedAt: null, ...(error ? { error } : {}) };
    if (!view.enabled || !def?.listModels) return fallback();
    if (cache && !opts.refresh) return fallback();
    const seen: string[] = [];
    try {
        const { definition, conn } = await ctx.fns.models.resolve({ id: view.id });
        const secret = conn.secret;
        conn.secret = async (key: string) => { const value = await secret(key); if (value) seen.push(value); return value; };
        const raw = await definition.listModels!(ctx, conn);
        if (!Array.isArray(raw)) throw new Error("Provider returned an invalid model list");
        const ids = new Set<string>();
        const models: types.models.ModelInfo[] = [];
        for (const m of raw.slice(0, 2000)) {
            if (!m || typeof m.id !== "string" || !m.id || m.id.length > 200 || ids.has(m.id)) continue;
            ids.add(m.id);
            const n = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
            const contextWindow = n(m.contextWindow), maxOutputTokens = n(m.maxOutputTokens);
            // Reasoning metadata is cached only when well-formed; models.stream re-validates it before use.
            const levels = ["off", "minimal", "low", "medium", "high", "xhigh"];
            const r = m.reasoning;
            const reasoning = r && Array.isArray(r.supported) && r.supported.length && r.supported.every(l => levels.includes(l)) && r.supported.includes(r.default) ? { supported: [...r.supported], default: r.default } : undefined;
            models.push({ id: m.id, ...(reasoning ? { reasoning } : {}), ...(typeof m.label === "string" ? { label: m.label.slice(0, 200) } : {}), ...(typeof m.description === "string" ? { description: m.description.slice(0, 500) } : {}), ...(contextWindow ? { contextWindow } : {}), ...(maxOutputTokens ? { maxOutputTokens } : {}) });
        }
        const now = Date.now();
        // The cache is metadata, not configuration: updated_at stays put so health caches survive.
        await ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET models_cache=?::jsonb, models_cached_at=? WHERE id=?", params: [JSON.stringify(models), now, view.id] });
        return { models: mark(models), source: "provider", cachedAt: now };
    } catch (error) {
        return fallback(ctx.fns.models.safeMessage({ message: error, secrets: seen, fallback: "Model discovery failed" }));
    }
}
