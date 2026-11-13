/**
 * Compare a saved worktree anchor with a safely read current diff
 *
 * Share outdated computation between list and mutation responses. Unavailable file paths are stale anchors; SSH transport failures propagate. Commit anchors never become outdated.
 * @param opts.row Saved anchor including pinned repository host and directory.
 * @param opts.cache Request-local patch cache keyed by repository, path and group.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Saved anchor including pinned repository host and directory. */
        row: types.gitUi.ReviewComment;
        /** Request-local patch cache keyed by repository, path and group. */
        cache?: Map<string,string|null>;
    },
): Promise<boolean> {
    const row=opts.row;if(row.scope!=='worktree')return false;
    const cache=opts.cache??new Map<string,string|null>();const key=JSON.stringify([row.host,row.dir,row.path,row.worktree_group]);
    if(!cache.has(key)){
     try{const diff=await ctx.fns.gitUi.diff({host:row.host,dir:row.dir,path:row.path,group:row.worktree_group});cache.set(key,diff.patch);}
     catch(error){if(error instanceof Error && /^(Changes are stale; refresh|Path is not in selected commit|Symlink ancestor refused|Not a regular file|Unsafe or unavailable working-tree path|Invalid repository path)$/.test(error.message) || error instanceof Error && 'code' in error && ['ENOENT','ENOTDIR'].includes(String(error.code)))cache.set(key,null);else throw error;}
    }
    const patch=cache.get(key);const current=patch==null?null:await ctx.fns.gitUi.commentLines({patch,side:row.side,start:row.line_start,end:row.line_end});return current===null||current!==row.line_text;
}
