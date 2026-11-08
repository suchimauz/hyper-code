/** Changes one agent's durable reasoning effort from the chat header. */
/**
 * Validate the submitted effort and update only the selected agent.
 * @param opts.req Incoming form request containing effort.
 * @param opts.params Route parameters containing the agent id.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming form request. */ req: Request;
    /** Route parameters containing id. */ params: Record<string, string>;
}) {
    const archivedRow = (await ctx.fns.procs.db.select({ sql: "SELECT archived_at FROM agents WHERE id = ?", params: [opts.params.id!] }))[0];
    if (!archivedRow) return Response.json({ error: "not_found", message: "Agent not found" }, { status: 404 });
    if (archivedRow.archived_at != null) return Response.json({ error: "archived", message: "Restore this archived chat before making changes" }, { status: 409 });
    const form = await opts.req.formData();
    const effort = String(form.get("effort") ?? "auto") as types.llm.ReasoningEffort;
    try {
        const result = await ctx.fns.agent.setReasoningEffort({ id: opts.params.id!, effort });
        return new Response(null, { status: 204, headers: { "HX-Refresh": "true", "x-hyper-effort": result.applied } });
    } catch (error: any) {
        return new Response(error?.message ?? "Invalid effort", { status: 400 });
    }
}
