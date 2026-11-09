/** Open a source message in the native reader, or supply its read-only JSON representation.
 * Enforces exact durable ownership before reading messages or redirecting. Archived sources remain readable by their owner; open/shared-password access is limited to ownerless agents.
 * @param opts.req Incoming browser or JSON request used to resolve the authenticated owner.
 * @param opts.params Durable agent identifier and source message index.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming request used for ownership authorization. */ req: Request;
    /** Durable source coordinates. */ params: { id: string; idx: string };
}): Promise<Response> {
    const { id, idx } = opts.params;
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !/^\d+$/.test(idx) || !Number.isSafeInteger(Number(idx))) return new Response('Not Found', { status: 404 });
    const who = await ctx.fns.auth.currentUser({ req: opts.req });
    if (who.required && !who.user && !who.legacy) return new Response('Authentication required', { status: 401, headers: { 'cache-control': 'no-store' } });
    // Deliberately retain archived provenance; unlike Canvas, this endpoint is read-only.
    const rows = await ctx.fns.procs.db.select({ sql: 'SELECT created_by FROM agents WHERE id = ?', params: [id] });
    const owner = rows[0];
    if (!owner || (who.user ? owner.created_by !== who.user.id : owner.created_by != null)) return new Response('Not Found', { status: 404, headers: { 'cache-control': 'no-store' } });
    if (opts.req.headers.get('accept')?.includes('application/json')) return ctx.fns.agent.sourceMessagePage({ id, idx: Number(idx) });
    const query = new URLSearchParams({ view: 'extension:agent-source/overview', sourceAgent: id, sourceIndex: idx });
    return new Response(null, { status: 303, headers: { location: `/?${query}`, 'cache-control': 'no-store' } });
}
