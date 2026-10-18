/** Archive an idle chat; return actionable failures without discarding live state.
 * JSON clients opt in with Accept: application/json; successful form posts redirect.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming request, whose Accept header selects JSON rather than a redirect. */
    req: Request;
    /** Route parameters containing the conversation id. */
    params: Record<string, string>;
}) {
    const id = opts.params.id!;
    try {
        const { ok } = await ctx.fns.session.archive({ id });
        if (!ok) return Response.json({ ok: false, code: 'not_found', error: 'Chat not found.' }, { status: 404 });
        if (opts.req.headers.get('accept')?.includes('application/json')) return Response.json({ ok: true });
        return new Response(null, { status: 303, headers: { location: '/?archived=' + encodeURIComponent(id) } });
    } catch (error) {
        const code = (error as { code?: string }).code;
        const conflict = code === 'busy' || code === 'queued' || code === 'scheduled' || code === 'conflict';
        if (!conflict) console.error('[session.archive]', error);
        return Response.json({ ok: false, code: conflict ? code : 'archive_failed', error: conflict ? (error as Error).message : 'Could not archive this chat. Please try again.' }, { status: conflict ? 409 : 500 });
    }
}
