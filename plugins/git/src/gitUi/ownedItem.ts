/**
 * Resolve an open owned Git tab for a non-archived agent; use only after authenticating the agent identity.
 *
 * Resolve an open owned Git tab for a non-archived agent; use only after authenticating the agent identity.
 * @param opts.agentId Trusted owning agent identifier; HTTP callers must first pass canvas.authorizeHttp.
 * @param opts.itemId Identifier of an open Git Canvas item owned by this agent.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Trusted owning agent identifier; HTTP callers must first pass canvas.authorizeHttp. */
        agentId: string;
        /** Identifier of an open Git Canvas item owned by this agent. */
        itemId: number;
    },
): Promise<{agentId:string;item:types.canvas.Item;host:string;dir:string}> {
    const active=await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id = ? AND archived_at IS NULL',params:[opts.agentId]});
    const item=(await ctx.fns.canvas.list({agentId:opts.agentId})).find(i=>i.id===opts.itemId&&i.kind==='gitUi.repository');
    if(!active.length||!item)throw Object.assign(new Error('Git tab is unavailable'),{status:403});
    const {host,dir}=item.args;
    if(typeof host!=='string'||typeof dir!=='string'||!dir.startsWith('/'))throw Object.assign(new Error('Invalid pinned repository'),{status:403});
    return {agentId:opts.agentId,item,host,dir};
}
