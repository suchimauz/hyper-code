/**
 * Atomically update personal ordered project tabs using optimistic concurrency.
 *
 * Explicit navigation mutation with compare-and-swap retries. Closing removes only the viewer tab, never archives, stops, deletes, or changes an agent.
 * @param opts.projectId Visible project identifier.
 * @param opts.action Select/add a chat, close it, or reorder existing tabs.
 * @param opts.agentId Chat to select or close; omitted open selects existing active tab.
 * @param opts.tabIds Exact permutation of current tabs when reordering.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Visible project identifier. */
        projectId: string;
        /** Select/add a chat, close it, or reorder existing tabs. */
        action: "open" | "close" | "reorder";
        /** Chat to select or close; omitted open selects existing active tab. */
        agentId?: string;
        /** Exact permutation of current tabs when reordering. */
        tabIds?: string[];
    },
): Promise<types.projects.TabState> {
    const principal=await ctx.fns.projects.principal({});
    await ctx.fns.projects.materialize({projectId:opts.projectId});
    for(let attempt=0;attempt<20;attempt++) {
     const state=await ctx.fns.projects.tabs({projectId:opts.projectId});
     if(opts.action==='open' && opts.agentId && !(await ctx.fns.projects.chats({projectId:opts.projectId})).some(c=>c.id===opts.agentId)) throw new Error('Chat does not belong to active project');
     let ids=[...state.tabIds],active=state.activeId;
     if(opts.action==='open' && opts.agentId){if(!ids.includes(opts.agentId)) ids.push(opts.agentId);active=opts.agentId;}
     if(opts.action==='close' && opts.agentId){const index=ids.indexOf(opts.agentId);ids=ids.filter(id=>id!==opts.agentId);if(active===opts.agentId)active=ids[Math.max(0,index-1)]??null;}
     if(opts.action==='reorder') {const next=opts.tabIds??[];if(next.length!==ids.length||new Set(next).size!==ids.length||next.some(id=>!ids.includes(id)))throw new Error('Order must contain every open tab exactly once');ids=[...next];}
     await ctx.fns.procs.db.run({sql:'INSERT INTO project_tabs(principal,project_id) VALUES(?,?) ON CONFLICT DO NOTHING',params:[principal,opts.projectId]});
     const updated=await ctx.fns.procs.db.select({sql:'UPDATE project_tabs SET tab_ids=?::jsonb,active_id=?,revision=revision+1 WHERE principal=? AND project_id=? AND revision=? RETURNING revision',params:[JSON.stringify(ids),active,principal,opts.projectId,state.revision]});
     if(updated.length){
      ctx.fns.procs.events.emit({topic:'projects',event:{type:'projects.changed'}});
      return {projectId:opts.projectId,tabIds:ids,activeId:active,revision:updated[0].revision};
     }
    }
    throw new Error('Tabs changed concurrently; retry navigation');
}
