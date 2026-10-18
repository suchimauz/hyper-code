/**
 * Persist a visible project and the current viewer membership idempotently.
 *
 * For explicit project selection only. Resolves visibility before inserting; does not alter agent workspaces.
 * @param opts.projectId Visible project ID.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Visible project ID. */
        projectId: string;
    },
): Promise<types.projects.Project> {
    const principal=await ctx.fns.projects.principal({});
    const project=await ctx.fns.projects.get({projectId:opts.projectId});
    if (!project) throw new Error('Project not found');
    await ctx.fns.procs.db.run({sql:'INSERT INTO projects(id,host,dir,title,created_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING',params:[project.id,project.host,project.dir,project.dir.split('/').pop()||'/',Date.now()]});
    await ctx.fns.procs.db.run({sql:'INSERT INTO project_members(principal,project_id,title) VALUES(?,?,?) ON CONFLICT DO NOTHING',params:[principal,project.id,project.title]});
    return {...project,virtual:false};
}
