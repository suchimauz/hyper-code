/**
 * Return minimal presence data for the owner-only native People page.
 * Does not expose event-stream chat ids, tab counts, email addresses or identity pictures.
 * @param opts.req Authenticated request; JSON Accept selects data, otherwise redirects to People.
 * @param opts.params Route parameters (unused).
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const me = (session as Session & { user?: types.auth.User })?.user;
    const headers = { 'cache-control': 'no-store', vary: 'Accept' };
    if (!me) return Response.json({error:'Sign in required'}, {status:401, headers});
    if (me.role !== 'owner') return Response.json({error:'Only owners can manage people'}, {status:403, headers});
    if (!opts.req.headers.get('accept')?.includes('application/json')) return new Response(null, {status:303, headers:{...headers, location:'/?view=people'}});
    const users = await ctx.fns.auth.listUsers({});
    const allowed = new Set(users.filter(u => !u.disabledAt).map(u => u.id));
    const onlineIds = ctx.fns.procs.events.presence({}).filter(p => p.id !== 'local' && allowed.has(p.id)).map(p => p.id);
    return Response.json({onlineIds}, {headers});
}
