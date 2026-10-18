/**
 * Archive or restore a visible project for the current viewer without changing its chats
 *
 * Use for explicit project archive controls. Materializes discovered projects, preserves tabs, workspace and agent execution, and emits navigation invalidation. New navigation agents created after archival make the project active again.
 * @param opts.projectId Visible exact workspace project identifier.
 * @param opts.archived True archives the project; false restores it.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Visible exact workspace project identifier. */
        projectId: string;
        /** True archives the project; false restores it. */
        archived: boolean;
    },
): Promise<void> {
    const principal=await ctx.fns.projects.principal({});
    const project=await ctx.fns.projects.materialize({projectId:opts.projectId});
    await ctx.fns.procs.db.run({sql:'UPDATE project_members SET archived_at=? WHERE principal=? AND project_id=?',params:[opts.archived?Date.now():null,principal,project.id]});
    ctx.fns.procs.events.emit({topic:'projects',event:{type:'projects.changed'}});
}
