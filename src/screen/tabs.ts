// Mounted destinations, not a list of Chrome tabs or React navigation entries.
/**
 * List mounted destinations and try to identify one through screen.eval.
 * The current field is null if the compatibility document does not answer or
 * its path does not match. The primary React shell does not provide this bridge.
 * This does not enumerate actual browser tabs; use browser plugin discovery for that.
 */
export default async function (ctx: Context, _session: Session | null, _opts?: {}) {
    const tabs = ["apps", ...(ctx.state.procs.modules ?? []).map(p => (p.namespaces[0] ?? p.name))];
    const path = await ctx.fns.screen.eval({ code: "return location.pathname" }).catch(() => null);
    return { tabs, current: tabs.find(t => path === `/${t}` || String(path).startsWith(`/${t}/`)) ?? null };
}
