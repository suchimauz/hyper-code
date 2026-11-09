/** Preview a voice command without execution, scoped to the authenticated user's agents and protected by CSRF. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** JSON request containing text, partial and optional focusAgentId. */ req: Request;
    /** HTTP route parameters (unused). */ params: Record<string, string>;
}): Promise<Response> {
    const who = await ctx.fns.auth.currentUser({req:opts.req});
    if (!who.user) return Response.json({error:'authentication_required'}, {status:401});
    if (!await ctx.fns.auth.verifyCsrf({req:opts.req,token:opts.req.headers.get('X-CSRF-Token') ?? ''})) return Response.json({error:'invalid_csrf'}, {status:403});
    try {
        const b = await opts.req.json();
        if (typeof b.text !== 'string' || b.text.length > 10000 || (b.focusAgentId != null && typeof b.focusAgentId !== 'string')) return Response.json({error:'invalid_request'}, {status:400});
        if (b.focusAgentId) {
            const denied = await ctx.fns.canvas.authorizeHttp({req:opts.req,agentId:b.focusAgentId});
            if (denied) return denied;
        }
        return Response.json(await ctx.fns.whisper.dispatch({text:b.text,partial:b.partial === true,focusAgentId:b.focusAgentId || undefined,ownerId:who.user.id}), {headers:{'Cache-Control':'no-store'}});
    } catch (e) { return Response.json({error:String(e instanceof Error ? e.message : e)}, {status:400}); }
}
