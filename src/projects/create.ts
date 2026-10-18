/**
 * Add a validated existing workspace to the viewer project list.
 *
 * Explicit creation validates the existing path through workspace helpers without mkdir. Does not mutate any chat or current workspace.
 * @param opts.dir Existing absolute workspace directory.
 * @param opts.host SSH alias; omitted means local.
 * @param opts.title Personal project title; defaults to directory basename.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Existing absolute workspace directory. */
        dir: string;
        /** SSH alias; omitted means local. */
        host?: string;
        /** Personal project title; defaults to directory basename. */
        title?: string;
    },
): Promise<types.projects.Project> {
    const principal=await ctx.fns.projects.principal({});
    const input=await ctx.fns.projects.identity({dir:opts.dir,host:opts.host});
    await ctx.fns.workspace.normalize({dir:input.dir,host:input.host,create:false});
    const identity=input;
    const title=opts.title?.trim() || identity.dir.split('/').filter(Boolean).pop() || '/';
    if(title.length>200) throw new Error('Project title too long');
    await ctx.fns.procs.db.run({sql:'INSERT INTO projects(id,host,dir,title,created_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING',params:[identity.id,identity.host,identity.dir,identity.dir.split('/').pop()||'/',Date.now()]});
    await ctx.fns.procs.db.run({sql:'INSERT INTO project_members(principal,project_id,title) VALUES(?,?,?) ON CONFLICT(principal,project_id) DO UPDATE SET title=excluded.title',params:[principal,identity.id,title]});
    ctx.fns.procs.events.emit({topic:'projects',event:{type:'projects.changed'}});
    return {...identity,title,virtual:false};
}
