/**
 * Retrieve bounded pages of owned repository review comments, optionally restricted to exact UUIDs.
 *
 * IDs intersect status and path filters, never grant access, and do not change repository-wide counts.
 * An empty IDs list returns no comments; omitted IDs preserve ordinary listing. Follow nextPage with
 * unchanged filters. Details reflect current stored comments, not a delivery-time snapshot.
 * @param opts.agentId Trusted owning agent identifier; HTTP callers must first pass canvas.authorizeHttp.
 * @param opts.itemId Identifier of an open Git Canvas item owned by this agent.
 * @param opts.status Status filter; defaults to open.
 * @param opts.path Optional exact repository-relative path filter.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Trusted owning agent identifier; HTTP callers must first pass canvas.authorizeHttp. */
        agentId: string;
        /** Identifier of an open Git Canvas item owned by this agent. */
        itemId: number;
        /** Status filter; defaults to open. */
        status?: 'open'|'resolved'|'all';
        /** Optional exact repository-relative path filter. */
        path?: string;
        /** Exact comment UUIDs to match; omitted lists all matching comments, empty matches none. Duplicates are harmless. @maximum 500 */
        ids?: string[];
        /** Zero-based page; repository counts are independent of pagination. @default 0 @minimum 0 */
        page?: number;
        /** Maximum comments per page. @default 100 @minimum 1 @maximum 500 */
        limit?: number;
    },
): Promise<{comments:types.gitUi.ReviewComment[];openCount:number;unsentCount:number;nextPage:number|null}> {
    const {host,dir}=await ctx.fns.gitUi.ownedItem(opts);const status=opts.status??'open';
    if(!['open','resolved','all'].includes(status))throw new Error('Invalid status filter');
    const page=opts.page??0,limit=opts.limit??100;
    if(!Number.isSafeInteger(page)||page<0||!Number.isInteger(limit)||limit<1||limit>500||!Number.isSafeInteger(page*limit))throw new Error('Invalid pagination');
    if(opts.path!==undefined)await ctx.fns.gitUi.commentPath({path:opts.path});
    if(opts.ids!==undefined&&(!Array.isArray(opts.ids)||opts.ids.length>500||opts.ids.some(id=>typeof id!=='string'||!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id))))throw new Error('Invalid comment IDs: expected at most 500 UUIDs');
    const idsFilter=opts.ids===undefined?'':' AND c.id = ANY(?::uuid[])';
    const idsParams=opts.ids===undefined?[]:[`{${opts.ids.join(',')}}`];
    const rows=await ctx.fns.procs.db.select({sql:"SELECT c.* FROM git_review_comments c JOIN agents a ON a.id=c.agent_id AND a.archived_at IS NULL WHERE c.agent_id=? AND c.host=? AND c.dir=? AND (?='all' OR c.status=?) AND (?::text IS NULL OR c.path=?) "+idsFilter+" ORDER BY c.created_at,c.id LIMIT ? OFFSET ?",params:[opts.agentId,host,dir,status,status,opts.path??null,opts.path??null,...idsParams,limit+1,page*limit]});
    const counts=await ctx.fns.procs.db.select({sql:"SELECT count(*) FILTER (WHERE c.status='open') AS open, count(*) FILTER (WHERE c.status='open' AND c.sent_at IS NULL) AS unsent FROM git_review_comments c JOIN agents a ON a.id=c.agent_id AND a.archived_at IS NULL WHERE c.agent_id=? AND c.host=? AND c.dir=?",params:[opts.agentId,host,dir]});
    const cache=new Map<string,string|null>();const comments:types.gitUi.ReviewComment[]=[];
    for(const row of rows.slice(0,limit)){
     const outdated=await ctx.fns.gitUi.commentOutdated({row,cache});
     comments.push(await ctx.fns.gitUi.commentView({row,outdated}));
    }
    await ctx.fns.gitUi.ownedItem(opts);
    return {comments,nextPage:rows.length>limit?page+1:null,openCount:Number(counts[0].open),unsentCount:Number(counts[0].unsent)};
}
