/**
 * Close only the viewer tab without altering the chat lifecycle.
 *
 * Use only for explicit navigation actions. Personal state is isolated by the authenticated viewer and updated with concurrency control.
 * @param opts.projectId Visible exact project ID.
 * @param opts.agentId Chat tab to remove from this viewer project.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Visible exact project ID. */
        projectId: string;
        /** Chat tab to remove from this viewer project. */
        agentId: string;
    },
): Promise<types.projects.TabState> {
    return ctx.fns.projects.updateTabs({...opts,action:'close'});
}
