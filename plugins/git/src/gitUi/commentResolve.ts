/**
 * Resolve an owned Git review comment; reject closed tabs and archived agents and publish a committed change event.
 *
 * Resolve an owned Git review comment; reject closed tabs and archived agents and publish a committed change event.
 * @param opts.agentId Trusted owning agent identifier; HTTP callers must first pass canvas.authorizeHttp.
 * @param opts.itemId Identifier of an open Git Canvas item owned by this agent.
 * @param opts.id Owned comment UUID.
 * @param opts.note Resolution note, at most 2048 UTF-8 bytes.
 * @param opts.resolvedBy Trusted resolver identity; defaults to user.
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
        /** Resolution note, at most 2048 UTF-8 bytes. */
        note?: string;
        /** Trusted resolver identity; defaults to user. */
        resolvedBy?: 'user'|'agent';
    },
): Promise<{comment:types.gitUi.ReviewComment|null}> {
    return await ctx.fns.gitUi.commentMutate({...opts,operation:'resolve'});
}
