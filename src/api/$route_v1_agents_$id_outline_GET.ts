/** Return a cursor-paginated prompt outline for the authenticated chat navigation UI.
 * @param opts.req HTTP request with optional exclusive after cursor.
 * @param opts.params Route parameters identifying the agent.
 */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    const id = opts.params.id!;
    const rows = await ctx.fns.procs.db.select({ sql: "SELECT 1 FROM agents WHERE id = ?", params: [id] });
    if (!rows.length) return Response.json({ error: "not_found" }, { status: 404 });
    const raw = new URL(opts.req.url).searchParams.get("after");
    const after = raw == null ? -1 : Number(raw);
    if (!Number.isSafeInteger(after) || after < -1) return Response.json({ error: "invalid_cursor" }, { status: 400 });
    return Response.json(await ctx.fns.api.chatOutline({ id, after }), { headers: { "Cache-Control": "no-store" } });
}
