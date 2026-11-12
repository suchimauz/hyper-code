/**
 * Project a stored llm_connections row into a secret-free connection view
 *
 * Use when returning connections to callers or clients. Reports each declared or stored secret field only as set/not set; never includes secret values or secret:// references.
 * @param opts.row Raw llm_connections row as returned by procs.db.select.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Raw llm_connections row as returned by procs.db.select. */
        row: Record<string, unknown>;
    },
): types.models.ConnectionView {
    const row = opts.row;
    const parse = <T>(value: unknown, fallback: T): T => typeof value === "string" ? (() => { try { return JSON.parse(value) as T; } catch { return fallback; } })() : (value as T) ?? fallback;
    const provider = String(row.provider);
    const def = Object.hasOwn(ctx.state.models?.providers ?? {}, provider) ? ctx.state.models!.providers![provider]!.definition : undefined;
    const stored = parse<Record<string, string>>(row.secrets, {});
    const secrets: Record<string, boolean> = {};
    for (const field of def?.fields ?? []) if (field.type === "secret") secrets[field.key] = false;
    for (const key of Object.keys(stored)) secrets[key] = typeof stored[key] === "string" && stored[key].length > 0;
    return {
        id: String(row.id),
        provider,
        providerRegistered: !!def,
        accountName: String(row.account_name),
        config: parse<types.models.ResolvedConnection["config"]>(row.config, {}),
        secrets,
        transport: parse<types.models.TransportSpec>(row.transport, { kind: "direct" }),
        enabled: row.enabled === true,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}
