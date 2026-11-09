/**
 * Return owner-only People data to React, or navigate browser visits to the React People page.
 * @param opts.req Authenticated request; Accept application/json selects data without password hashes.
 * @param opts.params Route parameters (unused).
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const me = (session as Session & { user?: types.auth.User })?.user;
    const headers = { 'cache-control': 'no-store', vary: 'Accept' };
    if (!me || me.role !== 'owner') return Response.json({error:'Only owners can manage people'}, {status:403, headers});
    if (!opts.req.headers.get('accept')?.includes('application/json')) return new Response(null, {status:303, headers:{...headers, location:'/?view=people'}});
    const users = await ctx.fns.auth.listUsers({includeDisabled:true});
    const google = await ctx.fns.auth.googleConfig({});
    const identities = await ctx.fns.procs.db.select({sql:'SELECT user_id, provider FROM user_identities'});
    return Response.json({meId:me.id, csrfToken:await ctx.fns.auth.csrfToken({req:opts.req}),google:google ? {domain:google.domain,autoCreate:google.autoCreate} : null,
        users:users.map(u=>({id:u.id,name:u.name,email:u.email,role:u.role,disabledAt:u.disabledAt,hasPassword:u.hasPassword,providers:identities.filter(i=>i.user_id===u.id).map(i=>i.provider)})),
    }, {headers});
}
