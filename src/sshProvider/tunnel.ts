/**
 * Lease a pooled pinned SSH SOCKS tunnel to an instance for provider HTTP
 *
 * Use for every provider request routed through an SSH instance instead of opening a dedicated `ssh -D` per request. Tunnels are kept per instance name in reload-stable state and reused: an idle tunnel is granted first; otherwise a new one is opened lazily while fewer than `sshProvider.maxTunnels` exist and fewer than `sshProvider.maxConcurrentOpens` are being opened; otherwise the least-loaded tunnel is shared (SOCKS multiplexes many connections over one ssh). Opening goes through codexTunnel.openProduction, keeping its pinned host key, owner and listener-ownership checks. A tunnel whose ssh exits is dropped from the pool; one without leases closes after `sshProvider.idleCloseMs`. sshProvider.closeTunnels drains an instance after its descriptor changes. Open failures are not cached. Call `release()` exactly when the request's body is finished; it is idempotent.
 * @param opts.instance Exact SSH instance name whose pinned tunnel is needed.
 * @param opts.signal Cancels only the wait for a tunnel; never closes a shared tunnel.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact SSH instance name whose pinned tunnel is needed. */
        instance: string;
        /** Cancels only the wait for a tunnel; never closes a shared tunnel. */
        signal?: AbortSignal;
    },
): Promise<{ port: number; signal: AbortSignal; release: () => void }> {
    type Tunnel = { port: number; signal: AbortSignal; close: () => Promise<void>; active: number; draining: boolean; idle?: ReturnType<typeof setTimeout> };
    type Pool = { tunnels: Tunnel[]; opening: Set<Promise<Tunnel | null>>; generation: number };
    type PoolState = { pools: Map<string, Pool>; limits?: { at: number; maxTunnels: number; maxConcurrentOpens: number; idleCloseMs: number }; exitHook?: boolean };
    const state = ctx.state as typeof ctx.state & { sshProviderTunnels?: PoolState };
    const ps: PoolState = state.sshProviderTunnels ??= { pools: new Map<string, Pool>() };
    if (!ps.exitHook) {
        ps.exitHook = true;
        // ssh -D children would outlive a restarted server; one process listener stops every pool's tunnels
        // (boundedStop sends SIGTERM synchronously, before its first await).
        const g = globalThis as typeof globalThis & { __sshProviderTunnelPools?: Set<PoolState> };
        if (!g.__sshProviderTunnelPools) {
            const all = g.__sshProviderTunnelPools = new Set();
            process.once('exit', () => { for (const s of all) for (const p of s.pools.values()) for (const t of p.tunnels) void t.close().catch(() => undefined); });
        }
        g.__sshProviderTunnelPools.add(ps);
    }
    const name = opts.instance;
    if (typeof name !== 'string' || !name) throw Error('SSH instance required');
    opts.signal?.throwIfAborted();

    const now = Date.now();
    if (!ps.limits || now - ps.limits.at > 5000) {
        const read = async (key: string, fallback: number, min: number, max: number) => {
            const v = Number(await ctx.fns.settings.getNumber({ module: 'sshProvider', scopeType: 'global', key, fallback }));
            return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback;
        };
        ps.limits = {
            at: now,
            maxTunnels: await read('maxTunnels', 30, 1, 200),
            maxConcurrentOpens: await read('maxConcurrentOpens', 4, 1, 32),
            idleCloseMs: await read('idleCloseMs', 300000, 0, 86400000),
        };
    }
    const limits = ps.limits;

    // One small pool object per instance name, kept for the process lifetime so closures never race a replaced pool.
    const pool = (() => { let p = ps.pools.get(name); if (!p) { p = { tunnels: [], opening: new Set(), generation: 0 }; ps.pools.set(name, p); } return p; })();
    const drop = (t: Tunnel) => {
        const i = pool.tunnels.indexOf(t);
        if (i >= 0) pool.tunnels.splice(i, 1);
    };
    const shut = (t: Tunnel) => { clearTimeout(t.idle); t.idle = undefined; drop(t); void t.close().catch(() => undefined); };
    const grant = (t: Tunnel) => {
        clearTimeout(t.idle); t.idle = undefined; t.active++;
        let released = false;
        return {
            port: t.port, signal: t.signal,
            release: () => {
                if (released) return;
                released = true;
                t.active--;
                if (t.active > 0) return;
                if (t.draining || t.signal.aborted || limits.idleCloseMs === 0) return shut(t);
                t.idle = setTimeout(() => { if (t.active === 0) shut(t); }, limits.idleCloseMs);
                (t.idle as { unref?: () => void }).unref?.();
            },
        };
    };
    const open = () => {
        const generation = pool.generation;
        const p: Promise<Tunnel | null> = (async () => {
            // No caller signal here: aborting one request must not kill a tunnel others will share.
            const raw = await ctx.fns.codexTunnel.openProduction({ instance: name }) as { port: number; signal: AbortSignal; close: () => Promise<void> };
            const t: Tunnel = { port: raw.port, signal: raw.signal, close: raw.close, active: 0, draining: false };
            if (pool.generation !== generation || t.signal.aborted) { void t.close().catch(() => undefined); return null; }
            t.signal.addEventListener('abort', () => { if (t.active === 0) shut(t); else drop(t); }, { once: true });
            pool.tunnels.push(t);
            return t;
        })();
        pool.opening.add(p);
        const settle = () => { pool.opening.delete(p); };
        p.then(settle, settle);
        return p;
    };
    const waitFor = <T,>(p: Promise<T>) => new Promise<T>((resolve, reject) => {
        const abort = () => reject(opts.signal!.reason ?? Error('aborted'));
        opts.signal?.addEventListener('abort', abort, { once: true });
        p.then(resolve, reject).finally(() => opts.signal?.removeEventListener('abort', abort));
    });
    const leastLoaded = (list: Tunnel[]) => list.reduce((a: Tunnel, b: Tunnel) => (b.active < a.active ? b : a));

    for (;;) {
        opts.signal?.throwIfAborted();
        const live = pool.tunnels.filter(t => !t.draining && !t.signal.aborted);
        const idle = live.find(t => t.active === 0);
        if (idle) return grant(idle);
        const canOpen = live.length + pool.opening.size < limits.maxTunnels && pool.opening.size < limits.maxConcurrentOpens;
        if (canOpen) {
            const p = open();
            // A busy tunnel serves now; the new one joins the pool for later requests.
            if (live.length) { p.catch(() => undefined); return grant(leastLoaded(live)); }
            const t = await waitFor(p);
            if (!t) continue;
            if (t.draining || t.signal.aborted) continue;
            return grant(t);
        }
        if (live.length) return grant(leastLoaded(live));
        // Every slot is still opening: join the first one to finish. A failed open
        // is retried by the loop only while other opens remain; otherwise it is this request's error.
        let t: Tunnel | null;
        try { t = await waitFor(Promise.race(pool.opening)); }
        catch (e) { opts.signal?.throwIfAborted(); if (!pool.opening.size && !pool.tunnels.length) throw e; continue; }
        if (t && !t.draining && !t.signal.aborted) return grant(t);
    }
}
