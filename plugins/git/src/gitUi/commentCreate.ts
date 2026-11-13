/**
 * Create an owned Git review comment; reject closed tabs and archived agents and publish a committed change event.
 *
 * Create an owned Git review comment; reject closed tabs and archived agents and publish a committed change event.
 * @param opts.agentId Trusted owning agent identifier; HTTP callers must first pass canvas.authorizeHttp.
 * @param opts.itemId Identifier of an open Git Canvas item owned by this agent.
 * @param opts.anchor Contiguous diff range and captured text.
 * @param opts.body Markdown body, 1–8192 UTF-8 bytes.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Trusted owning agent identifier; HTTP callers must first pass canvas.authorizeHttp. */
        agentId: string;
        /** Identifier of an open Git Canvas item owned by this agent. */
        itemId: number;
        /** Contiguous diff range and captured text. */
        anchor: types.gitUi.CommentAnchor;
        /** Markdown body, 1–8192 UTF-8 bytes. */
        body: string;
    },
): Promise<{comment:types.gitUi.ReviewComment|null}> {
    return await ctx.fns.gitUi.commentMutate({...opts,operation:'create'});
}
