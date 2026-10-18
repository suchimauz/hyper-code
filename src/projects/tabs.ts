/**
 * Read the viewer ordered active project tabs without persisting changes.
 *
 * Filters archived, missing, and moved chats from persisted state. Reading never opens tabs or materializes projects.
 * @param opts.projectId Visible project identifier.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Visible project identifier. */
        projectId: string;
    },
): Promise<types.projects.TabState> {
    const principal=await ctx.fns.projects.principal({});
    const chats=await ctx.fns.projects.chats({projectId:opts.projectId});
    const valid=new Set(chats.map(c=>c.id));
    const rows=await ctx.fns.procs.db.select({sql:'SELECT tab_ids,active_id,revision FROM project_tabs WHERE principal=? AND project_id=?',params:[principal,opts.projectId]});
    const row=rows[0];
    const tabIds:string[]=(row?.tab_ids??[]).filter((id:string)=>valid.has(id));
    return {projectId:opts.projectId,tabIds,activeId:tabIds.includes(row?.active_id)?row.active_id:(tabIds[0]??null),revision:row?.revision??0};
}
