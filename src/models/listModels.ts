/**
 * List a connection's models from its provider, or its manually configured ids
 *
 * Use to fill model pickers for one connection. When the provider implements `listModels` and the connection is enabled, returns the provider's models (sanitized, de-duplicated); otherwise, or when discovery fails, returns the manual `config.models` ids. `source` says which list was returned and `error` carries a safe discovery failure message. Disabled connections never touch the network.
 * @param opts.id Connection UUID.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
    },
): Promise<{ models: types.models.ModelInfo[]; source: "provider" | "manual"; error?: string }> {
    const view = await ctx.fns.models.get({ id: opts.id });
    const manual: types.models.ModelInfo[] = (Array.isArray(view.config.models) ? view.config.models : []).filter((m): m is string => typeof m === "string" && !!m).map(id => ({ id }));
    const def = Object.hasOwn(ctx.state.models?.providers ?? {}, view.provider) ? ctx.state.models!.providers![view.provider]!.definition : undefined;
    if (!view.enabled || !def?.listModels) return { models: manual, source: "manual" };
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
            models.push({ id: m.id, ...(typeof m.label === "string" ? { label: m.label.slice(0, 200) } : {}), ...(typeof m.description === "string" ? { description: m.description.slice(0, 500) } : {}), ...(contextWindow ? { contextWindow } : {}), ...(maxOutputTokens ? { maxOutputTokens } : {}) });
        }
        return { models, source: "provider" };
    } catch (error) {
        return { models: manual, source: "manual", error: ctx.fns.models.safeMessage({ message: error, secrets: seen, fallback: "Model discovery failed" }) };
    }
}
