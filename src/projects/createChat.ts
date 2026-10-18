/**
 * Create a fresh root chat in an explicitly selected project and open its tab.
 *
 * Starts no model generation and inherits no parent history. Uses the exact stored workspace and never changes other chats.
 * @param opts.projectId Visible project identifier.
 * @param opts.title Optional fresh chat title.
 * @param opts.model Model identifier; defaults to instance model setting.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Visible project identifier. */
        projectId: string;
        /** Optional fresh chat title. */
        title?: string;
        /** Model identifier; defaults to instance model setting. */
        model?: string;
    },
): Promise<{agentId:string;projectId:string}> {
    const project=await ctx.fns.projects.materialize({projectId:opts.projectId});
    const created=await ctx.fns.agent.start({model:opts.model??await ctx.fns.settings.modelDefault({}),title:opts.title,workspaceDir:project.dir,workspaceHost:project.host,parentId:null,visibility:'nav',forkOffset:null});
    await ctx.fns.projects.open({projectId:project.id,agentId:created.id});
    return {agentId:created.id,projectId:project.id};
}
