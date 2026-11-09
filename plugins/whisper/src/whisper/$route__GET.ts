/** Open the native Whisper page, or return authenticated model and owned-agent choices for its controls. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming request; format=json selects the read-only controls contract. */ req: Request;
    /** HTTP route parameters (unused). */ params: Record<string, string>;
}): Promise<Response> {
    if (new URL(opts.req.url).searchParams.get('format') !== 'json') return new Response(null, { status: 302, headers: { Location: '/?view=extension:whisper/overview' } });
    const who = await ctx.fns.auth.currentUser({req: opts.req});
    if (!who.user) return Response.json({error: 'authentication_required'}, {status: 401});
    const { models } = await ctx.fns.whisper.models({});
    const agents = (await ctx.fns.session.list({owner: who.user.id})).filter(a => a.createdBy === who.user!.id && !a.parentId && !a.archivedAt).slice(0,60).map(a => ({id:a.id,title:a.title}));
    return Response.json({models, agents}, {headers:{'Cache-Control':'no-store'}});
}
