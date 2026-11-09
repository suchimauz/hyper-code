/** Build mounted plugin UI bundles once the plugin registry is loaded. */
export default async function (ctx: Context, _session: Session | null, _opts?: {}) {
    try { await ctx.fns.plugins.uiBuildAll({}); }
    catch (e) { ctx.fns.procs.log.warn({ event: 'plugins.ui.build.failed', msg: e instanceof Error ? e.message : String(e) }); }
}
