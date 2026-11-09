/** POST /knowledge/agent/:id/tracking — toggles entity extraction sidecars for one agent. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming form request. */ req: Request;
    /** Route path parameters. */ params: Record<string, string>;
}) {
    const who = await ctx.fns.auth.currentUser({ req: opts.req });
    if (who.required && !who.user && !who.legacy) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (who.user && who.user.role !== 'owner') return Response.json({ error: 'Owner access required' }, { status: 403 });
    if (opts.req.headers.get('sec-fetch-site') === 'cross-site') return Response.json({ error: 'Same origin required' }, { status: 403 });
    const origin = opts.req.headers.get('origin');
    if (origin !== null && origin !== await ctx.fns.http.publicOrigin({ req: opts.req })) return Response.json({ error: 'Same origin required' }, { status: 403 });
    if (!await ctx.fns.auth.verifyCsrf({ req: opts.req, token: opts.req.headers.get('x-csrf-token') ?? '' })) return Response.json({ error: 'Invalid request token' }, { status: 403 });
    const json = opts.req.headers.get('content-type')?.includes('application/json');
    const body = json ? await opts.req.json() : null;
    if (json && typeof body?.enabled !== 'boolean') return Response.json({ error: 'enabled must be boolean' }, { status: 400 });
    const enabled = json ? body.enabled : (await opts.req.formData()).get('enabled') === '1';
    try {
        await ctx.fns.knowledge.setTracking({ id: opts.params.id!, enabled });
    } catch (error: any) {
        return new Response(error?.message ?? "Invalid knowledge tracking setting", { status: 400 });
    }
    return new Response(null, { status: 204 });
}
