/**
 * Page through owned comments in bounded batches with repository counts and request-cached worktree diff comparison; archived agents are rejected.
 *
 * Page through owned comments in bounded batches with repository counts and request-cached worktree diff comparison; archived agents are rejected.
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
    const rows=await ctx.fns.procs.db.select({sql:"SELECT c.* FROM git_review_comments c JOIN agents a ON a.id=c.agent_id AND a.archived_at IS NULL WHERE c.agent_id=? AND c.host=? AND c.dir=? AND (?='all' OR c.status=?) AND (?::text IS NULL OR c.path=?) ORDER BY c.created_at,c.id LIMIT ? OFFSET ?",params:[opts.agentId,host,dir,status,status,opts.path??null,opts.path??null,limit+1,page*limit]});
    const counts=await ctx.fns.procs.db.select({sql:"SELECT count(*) FILTER (WHERE c.status='open') AS open, count(*) FILTER (WHERE c.status='open' AND c.sent_at IS NULL) AS unsent FROM git_review_comments c JOIN agents a ON a.id=c.agent_id AND a.archived_at IS NULL WHERE c.agent_id=? AND c.host=? AND c.dir=?",params:[opts.agentId,host,dir]});
    const cache=new Map<string,string|null>();const comments:types.gitUi.ReviewComment[]=[];
    for(const row of rows.slice(0,limit)){
     const outdated=await ctx.fns.gitUi.commentOutdated({row,cache});
     comments.push(await ctx.fns.gitUi.commentView({row,outdated}));
    }
    await ctx.fns.gitUi.ownedItem(opts);
    return {comments,nextPage:rows.length>limit?page+1:null,openCount:Number(counts[0].open),unsentCount:Number(counts[0].unsent)};
}
