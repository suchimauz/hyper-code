/** Changes the model for one native mobile chat. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const archivedRow = (await ctx.fns.procs.db.select({ sql: "SELECT archived_at FROM agents WHERE id = ?", params: [opts.params.id!] }))[0];
    if (!archivedRow) return Response.json({ error: "not_found", message: "Agent not found" }, { status: 404 });
    if (archivedRow.archived_at != null) return Response.json({ error: "archived", message: "Restore this archived chat before making changes" }, { status: 409 });
    let body: any;
    try { body = await opts.req.json(); } catch { return Response.json({ error: "invalid_json", message: "Expected JSON" }, { status: 400 }); }
    const model = typeof body.model === "string" ? body.model.trim() : "";
    if (!model) return Response.json({ error: "model_required", message: "Model is required" }, { status: 400 });
    try {
        const result = await ctx.fns.agent.setModel({ id: opts.params.id!, model, scope: "agent" });
        return Response.json({ version: 1, ok: true, model: result.model, from: result.from });
    } catch (error: any) {
        return Response.json({ error: "model_change_failed", message: String(error?.message ?? error) }, { status: 400 });
    }
}
