/**
 * Authorize owner-only attention inspection and explicit gap actions.
 *
 * Use before serving private gaps or executing individual declaration actions. Requires owner identity and cookie-bound CSRF for writes; open installations retain their existing access mode.
 * @param opts.req Incoming browser request.
 * @param opts.write Require a valid X-CSRF-Token header. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming browser request. */
        req: Request;
        /** Require a valid X-CSRF-Token header. @default false */
        write?: boolean;
    },
): Promise<Response | null> {
    const who=await ctx.fns.auth.currentUser({req:opts.req});
    if(who.required&&!who.user&&!who.legacy)return Response.json({error:'Authentication required'},{status:401});
    if(who.user&&who.user.role!=='owner')return Response.json({error:'Owner access required'},{status:403});
    if(opts.write&&!await ctx.fns.auth.verifyCsrf({req:opts.req,token:opts.req.headers.get('X-CSRF-Token')??''}))return Response.json({error:'Invalid CSRF token'},{status:403});
    return null;
}
