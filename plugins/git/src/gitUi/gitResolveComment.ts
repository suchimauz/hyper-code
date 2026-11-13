/**
 * Resolve a review comment owned by the calling agent in its workspace.
 *
 * Requires an open owned Git tab matching the calling workspace. Foreign comments are not found. Repeated resolution preserves the first resolution metadata.
 * @param opts.id Owned review comment UUID.
 * @param opts.note Resolution note, at most 2048 UTF-8 bytes.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Owned review comment UUID. */
        id: string;
        /** Resolution note, at most 2048 UTF-8 bytes. */
        note?: string;
    },
): Promise<{comment:types.gitUi.ReviewComment|null}> {
    const target=await ctx.fns.gitUi.commentToolTarget({});return await ctx.fns.gitUi.commentResolve({...target,id:opts.id,note:opts.note,resolvedBy:'agent'});
}
