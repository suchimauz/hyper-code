/**
 * Returns owner-filtered transient prompt metadata for the native dialog, never its value.
 * @param opts.req Authenticated browser request; omitted legacy RPC calls are denied.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Authenticated browser request; omitted legacy RPC calls are denied. */
    req?: Request;
}): Promise<Response> {
    const headers = { 'cache-control': 'no-store' };
    if (!(opts.req instanceof Request)) return Response.json({ error: 'HTTP request required' }, { status: 403, headers });
    const state = (ctx.state as any).secureInput;
    const prompt = state?.prompts?.values().next().value;
    if (!prompt && state?.closing) {
        const who = await ctx.fns.auth.currentUser({ req: opts.req });
        if ((!who.required || who.user || who.legacy) && (who.user?.id ?? null) === state.closing.ownerId) delete state.closing;
    }
    if (!prompt || !await ctx.fns.secureInput.authorize({ req: opts.req, id: prompt.id })) return Response.json({ prompt: null }, { headers });
    const { id, title, name, message, kind, maxlength, expiresAt } = prompt;
    return Response.json({ prompt: { id, title, name, message, kind, maxlength, expiresAt }, csrfToken: await ctx.fns.auth.csrfToken({ req: opts.req }) }, { headers });
}
