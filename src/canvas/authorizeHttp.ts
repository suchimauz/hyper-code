/**
 * Authorize a Canvas HTTP request against the active agent owner.
 *
 * Use before exposing Canvas items or changing their state over HTTP. Requires a signed-in current user when configured and exact agents.created_by ownership; rejects archived agents. Legacy open/shared-password instances may access only ownerless agents. Runtime Canvas procedures remain independent of HTTP authorization.
 * @param opts.req Incoming browser request used to resolve its authenticated user.
 * @param opts.agentId Target agent whose ownership and archive status must be checked.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming browser request used to resolve its authenticated user. */
        req: Request;
        /** Target agent whose ownership and archive status must be checked. */
        agentId: string;
    },
): Promise<Response | null> {
    const who = await ctx.fns.auth.currentUser({req: opts.req});
    if (who.required && !who.user && !who.legacy) return new Response('Authentication required', {status:401});
    const rows = await ctx.fns.procs.db.select({sql:'SELECT created_by FROM agents WHERE id = ? AND archived_at IS NULL',params:[opts.agentId]});
    const row = rows[0];
    if (!row || (who.user ? row.created_by !== who.user.id : row.created_by != null)) return new Response('Unknown agent', {status:404});
    return null;
}
