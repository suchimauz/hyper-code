/**
 * Authorize owner-only telemetry inspection and maintenance.
 *
 * Use on telemetry JSON routes before reading private traces or changing storage; honors open-instance mode and legacy owner sessions.
 * @param opts.req Incoming authenticated browser request.
 * @param opts.write Verify the cookie-bound CSRF header for a write. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming authenticated browser request. */
        req: Request;
        /** Verify the cookie-bound CSRF header for a write. @default false */
        write?: boolean;
    },
): Promise<Response | null> {
    const who = await ctx.fns.auth.currentUser({req:opts.req});
    if(who.required && !who.user && !who.legacy) return Response.json({error:'Authentication required'},{status:401});
    if(who.user && who.user.role !== 'owner') return Response.json({error:'Owner access required'},{status:403});
    if(opts.write && !await ctx.fns.auth.verifyCsrf({req:opts.req,token:opts.req.headers.get('X-CSRF-Token')??''})) return Response.json({error:'Invalid CSRF token'},{status:403});
    return null;
}
