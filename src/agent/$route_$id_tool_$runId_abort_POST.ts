// Stop ONE tool call, not the agent.
//
// Deliberately distinct from /stop: agent.stop aborts the run and resets the
// row, which is far more than a user wants when they only mean "give up on
// this shell command". Here the call is cancelled, the tool reports an honest
// "stopped by the user" result, and the agent's turn continues with it —
// which is also what makes a message that arrived during the wait get read.
/** Handles the id tool runId abort post HTTP route.
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route path parameters.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Incoming HTTP request. */
        req: Request;
        /** Values bound to the operation. */
        params: Record<string, string>;
    },
): Promise<Response> {
    const id = opts.params.id!;
    const runId = opts.params.runId!;
    const who = await ctx.fns.auth.currentUser({ req: opts.req });
    if (!who.user || who.legacy || who.user.disabledAt != null) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (!await ctx.fns.auth.verifyCsrf({ req: opts.req, token: opts.req.headers.get('x-csrf-token') ?? '' })) return Response.json({ error: 'invalid_csrf' }, { status: 403 });
    const owner = (await ctx.fns.procs.db.select({ sql: 'SELECT created_by, archived_at FROM agents WHERE id=?', params: [id] }))[0];
    if (!owner || owner.archived_at != null) return Response.json({ error: 'not_found' }, { status: 404 });
    if (owner.created_by !== who.user.id) return Response.json({ error: 'forbidden' }, { status: 403 });
    const run = ctx.fns.tools.runs({ agentId: id }).find(item => item.id === runId);
    if (!run) return Response.json({ error: "no such running tool call" }, { status: 404 });

    const result = ctx.fns.tools.abortRun({ id: runId });
    const seconds = Math.round((Date.now() - run.startedAt) / 1000);
    await ctx.fns.session.appendEvent({
        id,
        event: { type: "tool_aborted", runId, name: run.name, subject: run.subject, elapsedSec: seconds },
    });
    const agent = (ctx.state as any).agent?.[id];
    if (agent) await ctx.fns.session.syncAgentState({ agent });
    ctx.fns.procs.events.refresh({ topic: `agent:${id}`, reason: "tool-aborted" });

    if (opts.req.headers.get("hx-request") === "true") return new Response(null, { status: 204 });
    return Response.json({ ok: true, ...result });
}
