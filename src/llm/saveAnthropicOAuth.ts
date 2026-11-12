/**
 * Encrypt and atomically save a Claude OAuth account and its immutable proxy binding.
 * Use after successful authorization; reconnect preserves the existing route.
 * @param opts.access OAuth access token.
 * @param opts.refresh OAuth refresh token.
 * @param opts.expiresAt Access-token expiration time as a Unix timestamp in milliseconds.
 * @param opts.scopes Granted OAuth scopes.
 * @param opts.account Named credential slot, allowing several Claude logins side by side.
 * @param opts.label Human-readable name for the account, e.g. the e-mail.
 * @param opts.proxyId Saved proxy UUID for a new account; omit to preserve an existing binding.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** OAuth access token; encrypted before persistence. */ access: string;
        /** Rotating OAuth refresh token; encrypted before persistence. */ refresh: string;
        /** Token expiration time. */ expiresAt: number;
        /** Space-separated granted OAuth scopes. */ scopes?: string | null;
        /** Credential slot within the provider. @default "default" */ account?: string;
        /** Human-readable account name shown in the UI. */ label?: string | null;
        /** Saved proxy UUID for a new account; omit to preserve an existing binding. */ proxyId?: string | null },
): Promise<{ ok: true }> {
    const provider = "anthropic-oauth";
    const account = normalizeAccount(opts.account);
    const [accessEnc, refreshEnc] = await Promise.all([
        ctx.fns.llm.encryptOAuthSecret({ provider, field: "access", value: opts.access }),
        ctx.fns.llm.encryptOAuthSecret({ provider, field: "refresh", value: opts.refresh }),
    ]);
    const now = Date.now();
    await ctx.fns.procs.db.transaction({fn: async () => {
    // Serialize creation/reconnect of this slot before checking immutable routing.
    await ctx.fns.procs.db.select({sql:'SELECT pg_advisory_xact_lock(hashtextextended(?,0))',params:[`oauth:${provider}:${account}`]});
    const existing = (await ctx.fns.procs.db.select({sql:'SELECT account FROM oauth_credentials WHERE provider=? AND account=? FOR UPDATE',params:[provider,account]}))[0];
    const binding = await ctx.fns.llm.accountProxy({provider,account});
    if (existing && opts.proxyId !== undefined && (opts.proxyId ?? null) !== (binding?.id ?? null)) throw new Error('Account proxy cannot be changed; remove and add the account again');
    if (!existing && opts.proxyId) {
        await ctx.fns.socksProxy.validateIdentity({id:opts.proxyId});
        const proxy = (await ctx.fns.procs.db.select({sql:'SELECT id FROM socks_proxies WHERE id=? FOR KEY SHARE',params:[opts.proxyId]}))[0];
        if (!proxy) throw new Error('PROXY_CONFIG: selected proxy no longer exists');
    }
    await ctx.fns.procs.db.run({
        sql: `INSERT INTO oauth_credentials
            (provider, account, label, access_enc, refresh_enc, expires_at, scopes, metadata, version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, '{}', 1, ?, ?)
            ON CONFLICT(provider, account) DO UPDATE SET access_enc=excluded.access_enc,
              refresh_enc=excluded.refresh_enc, expires_at=excluded.expires_at,
              scopes=excluded.scopes, label=COALESCE(excluded.label, oauth_credentials.label),
              version=oauth_credentials.version+1, updated_at=excluded.updated_at, refresh_uncertain=FALSE`,
        params: [provider, account, opts.label ?? null, accessEnc, refreshEnc, opts.expiresAt, opts.scopes ?? null, now, now],
    });
    if (!existing && opts.proxyId) await ctx.fns.procs.db.run({sql:'INSERT INTO llm_account_proxies(provider,account,proxy_id) VALUES (?,?,?)',params:[provider,account,opts.proxyId]});
    }});
    return { ok: true };
}

// One spelling of "the only account": an empty slot and "default" are the same
// thing, so old callers and new ones cannot end up with two rows.
function normalizeAccount(account: string | undefined): string {
    const value = String(account ?? "").trim();
    return value && value !== "default" ? value.slice(0, 40) : "default";
}
