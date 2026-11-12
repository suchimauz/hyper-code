/**
 * Update a model connection, keeping omitted secrets
 *
 * Use to rename, reconfigure, change transport, or enable/disable a connection. Omitted fields keep their stored values; `config`, when given, replaces the whole non-secret configuration and is revalidated. Secret fields: a string replaces the stored value, `null` deletes it, an omitted key keeps it. The provider cannot change. Bumps `updatedAt`, which invalidates cached health. Returns the secret-free view.
 * @param opts.id Connection UUID.
 * @param opts.accountName New display account name (1–100 characters).
 * @param opts.config Replacement non-secret configuration.
 * @param opts.secrets Secret changes: string sets, null clears, absent keeps.
 * @param opts.transport Replacement outbound transport.
 * @param opts.enabled New enabled flag.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** New display account name (1–100 characters). */
        accountName?: string;
        /** Replacement non-secret configuration. */
        config?: Record<string, unknown>;
        /** Secret changes: string sets, null clears, absent keeps. */
        secrets?: Record<string, string | null>;
        /** Replacement outbound transport. */
        transport?: types.models.TransportSpec;
        /** New enabled flag. */
        enabled?: boolean;
    },
): Promise<types.models.ConnectionView> {
    const invalid = (message: string, field?: string): never => { throw Object.assign(new Error(message), { code: "VALIDATION", status: 400, ...(field ? { field } : {}) }); };
    const current = await ctx.fns.models.get({ id: opts.id });
    const id = current.id;
    let accountName = current.accountName;
    if (opts.accountName !== undefined) {
        accountName = typeof opts.accountName === "string" ? opts.accountName.trim() : "";
        if (!accountName || accountName.length > 100) invalid("Account name is required (1–100 characters)", "accountName");
    }
    if (opts.enabled !== undefined && typeof opts.enabled !== "boolean") invalid("enabled must be true or false", "enabled");
    const reconfigure = opts.config !== undefined || opts.secrets !== undefined || opts.transport !== undefined;
    let config = current.config;
    let secrets: Record<string, string | null> = {};
    let transport = current.transport;
    if (reconfigure) {
        const stored = Object.entries(current.secrets).filter(([, set]) => set).map(([key]) => key);
        const checked = await ctx.fns.models.validateConfig({ provider: current.provider, config: opts.config ?? current.config, secrets: opts.secrets, stored });
        config = checked.config; secrets = checked.secrets;
        if (opts.transport !== undefined) {
            const t = opts.transport;
            try { await ctx.fns.models.validateTransport({ transport: t, allowed: ctx.state.models!.providers![current.provider]!.definition.transports }); }
            catch (error) { invalid(error instanceof Error ? error.message : "Invalid transport", "transport"); }
            transport = t.kind === "socks" ? { kind: "socks", proxyId: t.proxyId } : t.kind === "ssh-tunnel" ? { kind: "ssh-tunnel", instance: t.instance } : { kind: "direct" };
        }
    }
    await ctx.fns.procs.db.transaction({ fn: async () => {
        const rows = await ctx.fns.procs.db.select({ sql: "SELECT secrets FROM llm_connections WHERE id=? FOR UPDATE", params: [id] });
        if (!rows[0]) throw Object.assign(new Error("Connection not found"), { code: "NOT_FOUND", status: 404 });
        const refs: Record<string, string> = typeof rows[0].secrets === "string" ? JSON.parse(rows[0].secrets) : { ...(rows[0].secrets ?? {}) };
        for (const [key, value] of Object.entries(secrets)) {
            if (value === null) {
                await ctx.fns.secrets.deleteLocal({ namespace: "models", name: `${id}.${key}` });
                delete refs[key];
            } else {
                await ctx.fns.secrets.putLocal({ namespace: "models", name: `${id}.${key}`, value, source: "models" });
                refs[key] = `secret://models/${id}.${key}`;
            }
        }
        await ctx.fns.procs.db.run({
            sql: "UPDATE llm_connections SET account_name=?, config=?::jsonb, secrets=?::jsonb, transport=?::jsonb, enabled=?, updated_at=GREATEST(updated_at+1, ?) WHERE id=?",
            params: [accountName, JSON.stringify(config), JSON.stringify(refs), JSON.stringify(transport), opts.enabled ?? current.enabled, Date.now(), id],
        });
    } });
    return await ctx.fns.models.get({ id });
}
