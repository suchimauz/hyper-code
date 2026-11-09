/**
 * Records a human approval for one plugin UI bundle hash and its exact grants
 *
 * Use only from the owner-authenticated, CSRF-protected POST /plugins/ui/approve request made by a person in the Plugins page; never call it on an agent's own initiative. Approves the current build only when the given hash equals it, storing the hash and requested grants so any later code or grant change requires approval again. Passing revoke removes the approval. Emits plugins.changed so open tabs load or unload the UI.
 * @param opts.name Mounted plugin name.
 * @param opts.hash Bundle hash the person saw; must equal the current build.
 * @param opts.approvedBy Approving user id for the audit record.
 * @param opts.revoke Remove the stored approval instead of granting it.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Mounted plugin name. */
        name: string;
        /** Bundle hash the person saw; must equal the current build. */
        hash: string;
        /** Approving user id for the audit record. */
        approvedBy?: string;
        /** Remove the stored approval instead of granting it. @default false */
        revoke?: boolean;
    },
): Promise<{ name: string; hash: string; approved: boolean }> {
    if (opts.revoke) {
        await ctx.fns.procs.db.run({ sql: 'DELETE FROM plugin_ui_approvals WHERE name = ?', params: [opts.name] });
    } else {
        const build = (await ctx.fns.plugins.uiCompile({ name: opts.name })).build;
        if (!build || build.error || !build.hash) throw new Error('Plugin UI is not built');
        if (build.hash !== opts.hash) throw new Error('Plugin UI changed since review; review it again');
        await ctx.fns.procs.db.run({
            sql: `INSERT INTO plugin_ui_approvals (name, hash, grants, approved_by, approved_at) VALUES (?, ?, ?::jsonb, ?, ?)
                  ON CONFLICT (name) DO UPDATE SET hash = EXCLUDED.hash, grants = EXCLUDED.grants, approved_by = EXCLUDED.approved_by, approved_at = EXCLUDED.approved_at`,
            params: [opts.name, build.hash, JSON.stringify(build.grants), opts.approvedBy ?? null, Date.now()],
        });
    }
    ctx.fns.procs.events.emit({ event: { type: 'plugins.changed' } });
    return { name: opts.name, hash: opts.hash, approved: !opts.revoke };
}
