/**
 * Build the provider-facing ResolvedConnection for one stored connection
 *
 * Internal step before calling provider test/listModels/usage/actions. Exposes only this connection's non-secret config, a lazy `secret(key)` reader limited to its own declared secret fields, and `fetch` bound to its saved transport (no direct fallback). Throws `NOT_FOUND` for unknown connections and `UNKNOWN_PROVIDER` when the provider is not registered. Never returns or logs secret values itself.
 * @param opts.id Connection UUID.
 * @param opts.signal Cancellation applied to every request made through the resolved fetch.
 * @param opts.timeoutMs Deadline for each request made through the resolved fetch. @default 30000 @minimum 1 @maximum 3600000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Cancellation applied to every request made through the resolved fetch. */
        signal?: AbortSignal;
        /** Deadline for each request made through the resolved fetch. @default 30000 @minimum 1 @maximum 3600000 */
        timeoutMs?: number;
    },
): Promise<{ view: types.models.ConnectionView; definition: types.models.ProviderDefinition; conn: types.models.ResolvedConnection }> {
    const view = await ctx.fns.models.get({ id: opts.id });
    const entry = Object.hasOwn(ctx.state.models?.providers ?? {}, view.provider) ? ctx.state.models!.providers![view.provider] : undefined;
    if (!entry) throw Object.assign(new Error(`Provider ${view.provider} is not registered`), { code: "UNKNOWN_PROVIDER", status: 409 });
    const definition = entry.definition;
    const secretKeys = new Set(definition.fields.filter(f => f.type === "secret").map(f => f.key));
    const transport = view.transport;
    const conn: types.models.ResolvedConnection = {
        id: view.id,
        provider: view.provider,
        accountName: view.accountName,
        config: structuredClone(view.config),
        secret: async (key: string) => {
            if (!secretKeys.has(key) || !view.secrets[key]) return null;
            return await ctx.fns.secrets.getLocal({ namespace: "models", name: `${view.id}.${key}` });
        },
        fetch: (url: string, init?: RequestInit) => ctx.fns.models.fetch({ transport, url, init, signal: opts.signal, timeoutMs: opts.timeoutMs ?? 30000 }),
    };
    return { view, definition, conn };
}
