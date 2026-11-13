/**
 * Resolve the calling agent workspace to an open owned Git tab.
 *
 * Use only for review tools; never accept a model-supplied agent or repository identity. Requires an injected calling agent and an exact pinned workspace match.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<{agentId:string;itemId:number}> {
    const caller=await ctx.fns.agent.current({}); const workspace=ctx.fns.workspace.get({}); if(workspace.agentId!==caller.id)throw new Error('Calling workspace is unavailable'); const host=workspace.host||'local'; const item=(await ctx.fns.canvas.list({agentId:caller.id})).find(i=>i.kind==='gitUi.repository'&&i.args.host===host&&i.args.dir===workspace.dir); if(!item)throw new Error('Open owned workspace Git tab required'); await ctx.fns.gitUi.ownedItem({agentId:caller.id,itemId:item.id}); return {agentId:caller.id,itemId:item.id};
}
