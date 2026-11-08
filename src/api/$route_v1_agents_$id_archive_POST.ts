/** Archive an idle agent from the native chat list with the shared lifecycle safety checks. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming native API request. */
    req: Request;
    /** Route parameters containing the agent id. */
    params: Record<string, string>;
}) {
    const id = opts.params.id!;
    try {
        const { ok } = await ctx.fns.session.archive({ id });
        if (!ok) return Response.json({ error: 'not_found', message: 'Agent not found' }, { status: 404 });
        return Response.json({ version: 1, ok: true, agentId: id, archived: true });
    } catch (error) {
        const code = (error as { code?: string }).code;
        const conflict = code === 'busy' || code === 'queued' || code === 'scheduled' || code === 'conflict';
        if (!conflict) console.error('[mobile.archive]', error);
        return Response.json({ ok: false, error: conflict ? code : 'archive_failed', message: conflict ? (error as Error).message : 'Could not archive this chat. Please try again.' }, { status: conflict ? 409 : 500 });
    }
}
