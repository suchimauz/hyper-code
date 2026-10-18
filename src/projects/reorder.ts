/**
 * Persist a new ordering of the viewer existing project tabs.
 *
 * Use only for explicit navigation actions. Personal state is isolated by the authenticated viewer and updated with concurrency control.
 * @param opts.projectId Visible exact project ID.
 * @param opts.tabIds Exact permutation of current open tab identifiers.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Visible exact project ID. */
        projectId: string;
        /** Exact permutation of current open tab identifiers. */
        tabIds: string[];
    },
): Promise<types.projects.TabState> {
    return ctx.fns.projects.updateTabs({...opts,action:'reorder'});
}
