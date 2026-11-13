/**
 * Update an owned Git review comment; reject closed tabs and archived agents and publish a committed change event.
 *
 * Update an owned Git review comment; reject closed tabs and archived agents and publish a committed change event.
 * @param opts.agentId Trusted owning agent identifier; HTTP callers must first pass canvas.authorizeHttp.
 * @param opts.itemId Identifier of an open Git Canvas item owned by this agent.
 * @param opts.id Owned comment UUID.
 * @param opts.body Replacement markdown body, 1–8192 UTF-8 bytes.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Trusted owning agent identifier; HTTP callers must first pass canvas.authorizeHttp. */
        agentId: string;
        /** Identifier of an open Git Canvas item owned by this agent. */
        itemId: number;
        /** Owned comment UUID. */
        id: string;
        /** Replacement markdown body, 1–8192 UTF-8 bytes. */
        body: string;
    },
): Promise<{comment:types.gitUi.ReviewComment|null}> {
    return await ctx.fns.gitUi.commentMutate({...opts,operation:'update'});
}
