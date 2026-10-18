/**
 * Resolve authorized project navigation for a page without loading transcripts.
 *
 * Read project summaries and personal tabs for initial rendering or live navigation refresh. Explicit navigation can show the current chat before browser selection persists it.
 * @param opts.agentId Current agent whose exact workspace selects its project.
 * @param opts.projectId Selected project when not viewing an agent.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Current agent whose exact workspace selects its project. */
        agentId?: string;
        /** Selected project when not viewing an agent. */
        projectId?: string;
    },
): Promise<{sidebar:string;tabs:string}> {
    const projects = await ctx.fns.projects.list({});
    const selected = opts.agentId ? await ctx.fns.projects.resolve({agentId:opts.agentId}) : opts.projectId ? await ctx.fns.projects.get({projectId:opts.projectId}) : null;
    const projectId=selected?.id;
    const chats=projectId ? await ctx.fns.projects.chats({projectId}) : [];
    const tabs=projectId ? await ctx.fns.projects.tabs({projectId}) : {tabIds:[],activeId:null};
    const tabIds=[...tabs.tabIds];
    if(opts.agentId && chats.some(c=>c.id===opts.agentId) && !tabIds.includes(opts.agentId)) tabIds.push(opts.agentId);
    return ctx.fns.projects.renderChrome({projects,projectId,activeId:opts.agentId || tabs.activeId || undefined,chats,tabIds});
}
