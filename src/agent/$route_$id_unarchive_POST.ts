/** Restore an archived chat without starting work; return actionable JSON failures. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming restore request. */
    req: Request;
    /** Route parameters containing the conversation id. */
    params: Record<string, string>;
}) {
    try {
        const { ok } = await ctx.fns.session.unarchive({ id: opts.params.id! });
        return Response.json(ok ? { ok: true } : { ok: false, code: 'not_found', error: 'Chat not found.' }, { status: ok ? 200 : 404 });
    } catch (error) {
        const code = (error as { code?: string }).code;
        const conflict = code === 'busy' || code === 'queued' || code === 'scheduled' || code === 'conflict';
        if (!conflict) console.error('[session.unarchive]', error);
        return Response.json({ ok: false, code: conflict ? code : 'restore_failed', error: conflict ? (error as Error).message : 'Could not restore this chat. Please try again.' }, { status: conflict ? 409 : 500 });
    }
}
