/**
 * Reads live details for the exact comment set referenced by a sent Git review chat event.
 *
 * Use for the Git review chat card expansion after authenticating the owning agent (canvas.authorizeHttp). Reads the persisted git_review_comments event of that agent, decodes its compact reference and lists the referenced IDs through commentsList, which still requires an open owned Git tab for the same host and directory; no tab means explicit 403 access denial, never a loosened target. Items keep the original send order; missing or deleted IDs become unavailable placeholders and comments changed after send are flagged as the current version. Details are live, not a snapshot, and are never appended to the transcript or model context.
 * @param opts.agentId Trusted authenticated owning agent identifier.
 * @param opts.eventIdx Index of the persisted review user event in this agent transcript. @minimum 0
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Trusted authenticated owning agent identifier. */
        agentId: string;
        /** Index of the persisted review user event in this agent transcript. @minimum 0 */
        eventIdx: number;
    },
): Promise<{eventIdx:number;host:string;dir:string;count:number;sentAt:number;items:Array<{id:string;state:'available';changedAfterSend:boolean;comment:types.gitUi.ReviewComment}|{id:string;state:'unavailable'}>}> {
    if(!Number.isInteger(opts.eventIdx)||opts.eventIdx<0)throw Object.assign(new Error('Invalid review event'),{status:400});
        const active=await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? AND archived_at IS NULL',params:[opts.agentId]});
        if(!active.length)throw Object.assign(new Error('Agent is unavailable'),{status:403});
        const row=(await ctx.fns.procs.db.select({sql:"SELECT e.payload, e.ts FROM events e JOIN messages m ON m.agent_id=e.agent_id AND m.idx=(e.payload::jsonb->>'messageIdx')::integer AND m.role='user' AND m.message_type='git_review_comments' WHERE e.agent_id=? AND e.idx=? AND e.payload::jsonb->>'type'='user'",params:[opts.agentId,opts.eventIdx]}))[0];
        const payload=row?(typeof row.payload==='string'?JSON.parse(row.payload):row.payload):null;
        const ref=payload?await ctx.fns.session.decodeReviewReference({value:payload.gitReview}):null;
        if(!ref)throw Object.assign(new Error('Review reference is unavailable'),{status:404});
        const item=(await ctx.fns.canvas.list({agentId:opts.agentId})).find(i=>i.kind==='gitUi.repository'&&i.args.host===ref.host&&i.args.dir===ref.dir);
        if(!item)throw Object.assign(new Error('Access denied: open the Git tab for '+ref.host+':'+ref.dir+' to view these comments'),{status:403});
        const {comments}=await ctx.fns.gitUi.commentsList({agentId:opts.agentId,itemId:item.id,ids:ref.ids,status:'all',limit:500});
        const byId=new Map(comments.map(c=>[String(c.id).toLowerCase(),c]));
        const sentAt=Number(row.ts);
        return {eventIdx:opts.eventIdx,host:ref.host,dir:ref.dir,count:ref.count,sentAt,items:ref.ids.map(id=>{const comment=byId.get(id);return comment?{id,state:'available' as const,changedAfterSend:Number(comment.updated_at)>sentAt,comment}:{id,state:'unavailable' as const};})};
}
