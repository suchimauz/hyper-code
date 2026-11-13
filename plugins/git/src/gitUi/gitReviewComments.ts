/**
 * List a bounded page of the calling agent workspace review comments.
 *
 * Requires an open owned Git tab matching the calling workspace. Follow nextPage with unchanged filters; restart at page zero after mutations. At most ten size-validated comments are returned per page, including anchors, quoted text, outdated and sent_at.
 * Supply ids with status:'all' to retrieve an exact delivered set, including resolved comments. Empty ids matches none;
 * missing, deleted or foreign IDs are omitted. Details are current, not historical snapshots. IDs never bypass workspace ownership.
 * @param opts.ids Optional exact UUID filter, at most 500 entries; duplicates do not duplicate results.
 * @param opts.status Comment status filter. @default open
 * @param opts.path Exact repository-relative path filter.
 * @param opts.page Zero-based page to retrieve. @default 0 @minimum 0
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Comment status filter. @default open */
        status?: 'open'|'resolved'|'all';
        /** Exact repository-relative path filter. */
        path?: string;
        /** Exact comment UUID filter; omitted preserves listing, empty matches none. Use status all for delivered sets. @maximum 500 */
        ids?: string[];
        /** Zero-based page to retrieve. @default 0 @minimum 0 */
        page?: number;
    },
): Promise<{comments:types.gitUi.ReviewComment[];openCount:number;unsentCount:number;nextPage:number|null}> {
    const target=await ctx.fns.gitUi.commentToolTarget({});return await ctx.fns.gitUi.commentsList({...target,status:opts.status,path:opts.path,ids:opts.ids,page:opts.page,limit:10});
}
