/**
 * Refresh an SSH provider account's OAuth tokens at most once across concurrent requests
 *
 * Single-flight wrapper over sshProvider.refresh for requests that share one account lease. The first caller re-reads the encrypted record; when another request has already rotated the tokens it returns them without contacting the provider, otherwise it refreshes once. Every concurrent caller for the same slot awaits that same result, so a refresh token is never spent twice. The refresh is bound to the tunnel lifetime, not to the first caller's cancellation, so one aborted chat cannot leave the account mid-rotation for the others.
 * @param opts.key Owner-bound encrypted account slot identity from sshProvider.binding.
 * @param opts.provider OAuth subscription provider.
 * @param opts.owner Expected record owner from sshProvider.binding.
 * @param opts.binding Expected record binding fingerprint from sshProvider.binding.
 * @param opts.proxyPort Owned SOCKS listener port used for the token endpoint.
 * @param opts.signal Tunnel lifetime signal; aborts the refresh only when the tunnel itself ends.
 * @param opts.store Encrypted compare-and-swap store for the slot.
 * @param opts.minValidMs Tokens valid for longer than this are reused instead of refreshed. @default 60000 @minimum 0
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Owner-bound encrypted account slot identity from sshProvider.binding. */
        key: string;
        /** OAuth subscription provider. */
        provider: string;
        /** Expected record owner from sshProvider.binding. */
        owner: string;
        /** Expected record binding fingerprint from sshProvider.binding. */
        binding: string;
        /** Owned SOCKS listener port used for the token endpoint. */
        proxyPort: number;
        /** Tunnel lifetime signal; aborts the refresh only when the tunnel itself ends. */
        signal?: AbortSignal;
        /** Encrypted compare-and-swap store for the slot. */
        store: { read: () => Promise<any>; save: (revision: number | null, value: object) => Promise<number> };
        /** Tokens valid for longer than this are reused instead of refreshed. @default 60000 @minimum 0 */
        minValidMs?: number;
    },
): Promise<{ access: string; refresh: string; expires: number; accountId?: string }> {
    const state = ctx.state as typeof ctx.state & { sshProviderRefreshes?: Map<string, Promise<any>> };
    const flights = state.sshProviderRefreshes ??= new Map();
    const running = flights.get(opts.key);
    if (running) return running;
    const minValid = opts.minValidMs ?? 60000;
    const flight = (async () => {
        const row = await opts.store.read();
        if (!row || row.value.owner !== opts.owner || row.value.binding !== opts.binding || row.value.provider !== opts.provider || row.value.mode !== 'socks')
            throw Error('Bound account unavailable; no fallback');
        const tokens = row.value.tokens;
        if (!tokens || typeof tokens.access !== 'string' || !Number.isFinite(tokens.expires)) throw Error('Invalid local credentials');
        if (tokens.expires > Date.now() + minValid) return tokens;
        return ctx.fns.sshProvider.refresh({ provider: opts.provider, proxyPort: opts.proxyPort, signal: opts.signal, store: opts.store, row });
    })();
    flights.set(opts.key, flight);
    try { return await flight; } finally { if (flights.get(opts.key) === flight) flights.delete(opts.key); }
}
