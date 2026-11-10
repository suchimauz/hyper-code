/**
 * Drain pooled SSH SOCKS tunnels of an instance after its descriptor, key pin or accounts change
 *
 * Use after an SSH instance is edited, re-pinned or removed (sshInstance.replaceDescriptor does this), so no new request reuses a tunnel opened with the old endpoint, key or host pin. Tunnels carry no account credentials, so account changes do not need it. Idle tunnels close at once; busy tunnels stop receiving new leases and close when their last request releases them; tunnels still opening are discarded when they finish. The next sshProvider.tunnel call opens fresh tunnels. Safe to call when the instance has no pool.
 * @param opts.instance Exact SSH instance name whose tunnels are drained.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact SSH instance name whose tunnels are drained. */
        instance: string;
    },
): Promise<{ closed: number; draining: number }> {
    type Tunnel = { port: number; signal: AbortSignal; close: () => Promise<void>; active: number; draining: boolean; idle?: ReturnType<typeof setTimeout> };
    type Pool = { tunnels: Tunnel[]; opening: Set<Promise<Tunnel | null>>; generation: number };
    const pools = (ctx.state as typeof ctx.state & { sshProviderTunnels?: { pools: Map<string, Pool> } }).sshProviderTunnels?.pools;
    const pool = pools?.get(opts.instance);
    if (!pool) return { closed: 0, draining: 0 };
    // Tunnels still opening see the new generation and close themselves instead of joining.
    pool.generation++;
    let closed = 0, draining = 0;
    const closing: Promise<void>[] = [];
    for (const t of [...pool.tunnels]) {
        t.draining = true;
        if (t.active > 0) { draining++; continue; }
        clearTimeout(t.idle); t.idle = undefined;
        pool.tunnels.splice(pool.tunnels.indexOf(t), 1);
        closing.push(t.close().catch(() => undefined));
        closed++;
    }
    await Promise.all(closing);
    return { closed, draining };
}
