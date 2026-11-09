/**
 * Searches registered navigation sources concurrently and returns bounded structured groups for React.
 * Source failures are isolated and timeouts abort their request. Prefixes restrict source selection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Search text as typed. */
        q: string;
        /** Tab id whose sources are asked; the first tab when omitted. */
        tab?: string;
        /** Rows per source. @default 12 @minimum 1 @maximum 100 */
        limit?: number;
        /** Budget per source in milliseconds. @default 2000 @minimum 50 @maximum 10000 */
        timeoutMs?: number;
        /** Reserved compatibility budget; all sources now settle within timeoutMs. @default 0 @minimum 0 */
        inlineMs?: number;
    },
): Promise<{ html: string; groups: Array<{ id: string; title: string; items: types.nav.Item[]; error?: string }>; pending: string[] }> {
    const registry = ((ctx.state as any).nav?.search ?? {}) as Record<string, types.nav.Search & types.nav.Registered>;
    const { tabs } = await ctx.fns.nav.tabs({});
    const tab = tabs.find(t => t.id === opts.tab) ?? tabs[0];
    let ids = tab ? tab.search : Object.keys(registry);
    let q = String(opts.q ?? "").trim();
    const prefixed = ids.filter(id => registry[id]?.prefix && q.startsWith(registry[id]!.prefix!));
    if (prefixed.length) {
        ids = prefixed;
        q = q.slice(registry[prefixed[0]!]!.prefix!.length).trim();
    }
    const limit = Math.max(1, Math.min(100, opts.limit ?? 12));
    const budget = Math.max(50, Math.min(10_000, opts.timeoutMs ?? 2000));
    const sources = ids.map(id => registry[id]!).filter(Boolean)
        .sort((a, b) => Number(a.order ?? 100) - Number(b.order ?? 100) || a.id.localeCompare(b.id));
    const run = async (source: types.nav.Search & types.nav.Registered) => {
        const abort = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const items = await Promise.race([
                Promise.resolve().then(() => source.search(ctx, session, { q, limit, signal: abort.signal })),
                new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error(`timed out after ${budget} ms`)); }, budget); }),
            ]);
            return { id: source.id, title: source.title, items: (Array.isArray(items) ? items : []).slice(0, limit) } as Group;
        } catch (error: any) {
            ctx.fns.procs.log.warn({ event: "nav.search", msg: `${source.id}: ${String(error?.message ?? error)}`, from: source.rel });
            return { id: source.id, title: source.title, items: [] as types.nav.Item[], error: String(error?.message ?? error) } as Group;
        } finally { if (timer) clearTimeout(timer); }
    };
    type Group = { id: string; title: string; items: types.nav.Item[]; error?: string };
    const groups = await Promise.all(sources.map(run));
    return { html: '', groups, pending: [] };
}
