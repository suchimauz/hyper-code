/** Updates the prompt-inject line for one native chat. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const archivedRow = (await ctx.fns.procs.db.select({ sql: "SELECT archived_at FROM agents WHERE id = ?", params: [opts.params.id!] }))[0];
    if (!archivedRow) return Response.json({ error: "not_found", message: "Agent not found" }, { status: 404 });
    if (archivedRow.archived_at != null) return Response.json({ error: "archived", message: "Restore this archived chat before making changes" }, { status: 409 });
    let body: any;
    try { body = await opts.req.json(); } catch { return Response.json({ error: "invalid_json", message: "Expected JSON" }, { status: 400 }); }
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const every = Math.min(100, Math.max(1, Number(body.every ?? 1) || 1));
    try { const result = await ctx.fns.agent.setStatusLine({ id: opts.params.id!, text, every }); return Response.json({ version: 1, text: result.text, every: result.every }); }
    catch (error: any) { return Response.json({ error: "invalid_inject", message: String(error?.message ?? error) }, { status: 400 }); }
}
