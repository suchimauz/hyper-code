/**
 * Promote a pending durable turn through existing chat acceptance
 *
 * Worker boundary promotion uses the current lease token. Explicit steering requires an item revision. Acceptance atomically checks agent and queue locks and commits uploads with the transcript.
 * @param opts.agentId Existing agent identifier.
 * @param opts.queueId Pending item selected for explicit steering.
 * @param opts.version Expected queue revision for steering.
 * @param opts.runToken Claim token for automatic FIFO promotion.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Existing agent identifier. */
        agentId: string;
        /** Pending item selected for explicit steering. */
        queueId?: string;
        /** Expected queue revision for steering. */
        version?: number;
        /** Claim token for automatic FIFO promotion. */
        runToken?: string;
    },
): Promise<Response | null> {
    if (!opts.runToken && (!opts.queueId || !Number.isSafeInteger(opts.version))) throw new Error('Explicit steering requires item and revision');
    const row=(await ctx.fns.procs.db.select({sql:opts.queueId ? "SELECT * FROM agent_turn_queue WHERE agent_id=? AND id=?" : "SELECT * FROM agent_turn_queue WHERE agent_id=? AND status='pending' ORDER BY sequence LIMIT 1",params:[opts.agentId,...(opts.queueId?[opts.queueId]:[])]}))[0];
    if(!row) return null;
    const form=new FormData(); form.set('text',row.text); form.set('requestId','queue:'+row.id);
    const files=typeof row.files==='string'?JSON.parse(row.files):row.files;
    for(const f of files) form.append('files',new File([Buffer.from(f.data,'base64')],f.name,{type:f.type}));
    return await ctx.fns.agent.acceptMessage({req:new Request('http://localhost/agent/'+encodeURIComponent(opts.agentId)+'?debounceSeconds=0',{method:'POST',body:form}),params:{id:opts.agentId},queue:{id:row.id,version:opts.version??Number(row.version),runToken:opts.runToken}});
}
