/**
 * Lists plugin UI bundles the browser may load, with their approved grants
 *
 * Use to answer GET /plugins/ui/manifest. Refreshes builds through plugins.uiBuildAll, then returns only bundles that are built and approved: official plugins are pre-approved, every other plugin needs a stored human approval whose bundle hash and grants equal the current build. Unapproved, changed or failed builds appear only in pending (for owners to review in the Plugins page) and never in plugins.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    _opts: {} = {},
): Promise<{
    apiVersion: 1;
    plugins: Array<{ name: string; url: string; hash: string; grants: types.plugins.UiGrants; applications: Record<string, string>; icon: string | null }>;
    pending: Array<{ name: string; source: string; hash: string | null; grants: types.plugins.UiGrants; error: string | null; reason: 'unapproved' | 'changed' | 'failed' }>;
}> {
    await ctx.fns.plugins.uiBuildAll({});
    const builds = Object.values((ctx.state as { plugins?: types.plugins.State }).plugins?.ui ?? {}).sort((a, b) => a.name.localeCompare(b.name));
    const rows = await ctx.fns.procs.db.select({ sql: 'SELECT name, hash, grants FROM plugin_ui_approvals', params: [] }) as Array<{ name: string; hash: string; grants: types.plugins.UiGrants | string }>;
    const approvals = new Map(rows.map(r => [r.name, { hash: r.hash, grants: typeof r.grants === 'string' ? JSON.parse(r.grants) as types.plugins.UiGrants : r.grants }]));
    const plugins: Array<{ name: string; url: string; hash: string; grants: types.plugins.UiGrants; applications: Record<string, string>; icon: string | null }> = [];
    const pending: Array<{ name: string; source: string; hash: string | null; grants: types.plugins.UiGrants; error: string | null; reason: 'unapproved' | 'changed' | 'failed' }> = [];
    const same = (a: types.plugins.UiGrants, b: types.plugins.UiGrants) => (['pages', 'panels', 'actions', 'canvasKinds', 'canvasLaunchers', 'sidebarNavigation', 'inputKinds'] as const).every(k => JSON.stringify([...(a[k] ?? [])].sort()) === JSON.stringify([...(b[k] ?? [])].sort()));
    for (const b of builds) {
        if (b.error || !b.hash || !b.code) { pending.push({ name: b.name, source: b.source, hash: b.hash, grants: b.grants, error: b.error, reason: 'failed' }); continue; }
        const approval = approvals.get(b.name);
        const approved = b.source === 'official' || (approval?.hash === b.hash && same(approval.grants, b.grants));
        if (approved) plugins.push({ name: b.name, url: `/plugins/ui/${encodeURIComponent(b.name)}/${b.hash}.js`, hash: b.hash, grants: b.grants, applications: b.applications, icon: b.icon ?? null });
        else pending.push({ name: b.name, source: b.source, hash: b.hash, grants: b.grants, error: null, reason: approval ? 'changed' : 'unapproved' });
    }
    return { apiVersion: 1, plugins, pending };
}
