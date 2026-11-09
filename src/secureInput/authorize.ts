/**
 * Authorize browser access to an in-memory transient prompt owner
 *
 * Use only in the protected native secure-input HTTP handlers. Checks authentication and exact captured owner, and rechecks durable agent ownership before exposing metadata or accepting a value.
 * @param opts.req Browser request carrying authentication cookies.
 * @param opts.id Exact active transient prompt identifier.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Browser request carrying authentication cookies. */
        req: Request;
        /** Exact active transient prompt identifier. */
        id: string;
    },
): Promise<boolean> {
    const who = await ctx.fns.auth.currentUser({ req: opts.req });
    if (who.required && !who.user && !who.legacy) return false;
    const prompt = (ctx.state as any).secureInput?.prompts?.get(opts.id);
    if (!prompt || prompt.expiresAt <= Date.now() || (who.user?.id ?? null) !== prompt.ownerId) return false;
    if (prompt.agentId) {
     const rows = await ctx.fns.procs.db.select({sql:'SELECT created_by FROM agents WHERE id = ? AND archived_at IS NULL',params:[prompt.agentId]});
     if (!rows[0] || rows[0].created_by !== prompt.ownerId) return false;
    }
    return true;
}
