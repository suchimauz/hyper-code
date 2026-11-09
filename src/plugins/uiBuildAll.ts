/**
 * Rebuilds the browser UI bundles of every mounted plugin and announces changes
 *
 * Use after mounting, adding, removing or reloading plugins, and before serving the plugin UI manifest. Calls plugins.uiCompile for each mounted plugin (cheap when its source fingerprint is unchanged), drops builds of plugins that are no longer mounted, and emits one global live event of type plugins.changed when any bundle, grant or error changed so open browser tabs re-read the manifest without a page reload.
 * @param opts.force Rebuild every bundle even when fingerprints are unchanged.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Rebuild every bundle even when fingerprints are unchanged. @default false */
        force?: boolean;
    } = {},
): Promise<{ built: string[]; failed: Array<{ name: string; error: string }>; changed: boolean }> {
    const mounted = (ctx.fns.procs.modules.list({}) as Array<{ name: string; plugin?: boolean }>).filter(m => m.plugin).map(m => m.name);
    const state = ((ctx.state as { plugins?: types.plugins.State }).plugins ??= {}); const builds = (state.ui ??= {});
    let changed = false;
    for (const name of Object.keys(builds)) if (!mounted.includes(name)) { delete builds[name]; changed = true; }
    const built: string[] = [], failed: Array<{ name: string; error: string }> = [];
    for (const name of mounted) {
        try {
            const result = await ctx.fns.plugins.uiCompile({ name, force: opts.force === true });
            if (result.changed) changed = true;
            if (result.build?.error) failed.push({ name, error: result.build.error });
            else if (result.build) built.push(name);
        } catch (e) { failed.push({ name, error: e instanceof Error ? e.message : String(e) }); }
    }
    if (changed) ctx.fns.procs.events.emit({ event: { type: 'plugins.changed' } });
    return { built, failed, changed };
}
