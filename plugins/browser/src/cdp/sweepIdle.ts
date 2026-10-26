/**
 * Closes agent-created browser tabs after ten minutes without CDP activity.
 *
 * Runs from the idle reaper. Only explicitly owned targets qualify; pending commands, aliases with recent activity, and live viewers protect a target. Failed closes are retried on a later sweep. Closed session tombstones preserve target identity and require browser.sessionForget before reuse.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<{ closed: string[]; failed: string[] }> {
    type Handle = { targetId: string; owned?: boolean; closed?: boolean; closing?: boolean; lastUsed?: number; pending: Map<number, object>; ws?: { close(): void } | null };
    const state = (ctx.state as { cdp?: { sessions?: Map<string, Handle>; sweeping?: boolean }; browser?: { live?: Set<{ conn?: { targetId(): string } }> } });
    const result = { closed: [] as string[], failed: [] as string[] };
    const cdp = state.cdp;
    if (!cdp?.sessions || cdp.sweeping) return result;
    cdp.sweeping = true;
    try {
        const targets = new Set([...cdp.sessions.values()].filter(h => h.owned && !h.closed).map(h => h.targetId));
        for (const targetId of targets) {
            const entries = [...cdp.sessions.values()].filter(h => h.targetId === targetId);
            if (entries.some(h => h.closed || h.closing || h.pending.size || !Number.isFinite(h.lastUsed) || Date.now() - h.lastUsed! < 600_000)) continue;
            if ([...(state.browser?.live ?? [])].some(view => view.conn?.targetId() === targetId)) {
                for (const h of entries) h.lastUsed = Date.now();
                continue;
            }
            // Mark synchronously before yielding: session() refuses new commands during close.
            for (const h of entries) h.closing = true;
            try {
                const url = ctx.fns.procs.env.cdpUrl({});
                const response = await fetch(url + '/json/close/' + encodeURIComponent(targetId), { signal: AbortSignal.timeout(5000) });
                if (!response.ok && response.status !== 404) throw new Error('Chrome close returned ' + response.status);
                for (const h of entries) {
                    h.closed = true;
                    try { h.ws?.close(); } catch (error) { console.warn('CDP idle socket close failed', targetId, error); }
                }
                result.closed.push(targetId);
            } catch (error) {
                result.failed.push(targetId);
                console.warn('CDP idle target close failed', targetId, error);
            } finally {
                for (const h of entries) h.closing = false;
            }
        }
        return result;
    } finally { cdp.sweeping = false; }
}
