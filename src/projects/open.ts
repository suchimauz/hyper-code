/**
 * Select a project and optionally open a personal chat tab.
 *
 * Use only for explicit navigation actions. Personal state is isolated by the authenticated viewer and updated with concurrency control.
 * @param opts.projectId Visible exact project ID.
 * @param opts.agentId Active project chat to select; omitted keeps prior selection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Visible exact project ID. */
        projectId: string;
        /** Active project chat to select; omitted keeps prior selection. */
        agentId?: string;
    },
): Promise<types.projects.TabState> {
    return ctx.fns.projects.updateTabs({...opts,action:'open'});
}
