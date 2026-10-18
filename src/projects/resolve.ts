/**
 * Resolve a navigation chat to its visible exact project without loading history.
 *
 * Read-only route support for direct agent links. Null or relative workspaces and non-navigation agents are unassigned.
 * @param opts.agentId Chat identifier from direct navigation.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Chat identifier from direct navigation. */
        agentId: string;
    },
): Promise<types.projects.Project | null> {
    await ctx.fns.projects.principal({});
    const rows=await ctx.fns.procs.db.select({sql:"SELECT workspace_dir,workspace_host FROM agents WHERE id=? AND visibility='nav'",params:[opts.agentId]});
    const row=rows[0];
    if(!row?.workspace_dir?.startsWith('/')) return null;
    const identity=await ctx.fns.projects.identity({dir:row.workspace_dir,host:row.workspace_host??''});
    return ctx.fns.projects.get({projectId:identity.id});
}
