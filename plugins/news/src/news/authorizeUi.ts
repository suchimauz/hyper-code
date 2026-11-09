/**
 * Authorize owner access and cookie-bound CSRF for News and RSS browser requests.
 *
 * Use before reading private feed data or accepting browser mutations; returns a denial response without performing an action.
 * @param opts.req Incoming browser request; non-GET requests require a cookie-bound CSRF header.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming browser request; non-GET requests require a cookie-bound CSRF header. */
        req: Request;
    },
): Promise<Response | null> {
    const who = await ctx.fns.auth.currentUser({req:opts.req});
    const { user } = who;
    if (who.required && !user && !who.legacy) return Response.json({error:'Unauthorized'}, {status:401});
    if (user && user.role !== 'owner') return Response.json({error:'Owner access required'}, {status:403});
    if (opts.req.method !== 'GET' && !await ctx.fns.auth.verifyCsrf({req:opts.req,token:opts.req.headers.get('x-csrf-token') ?? ''})) return Response.json({error:'Invalid CSRF token'}, {status:403});
    return null;
}
