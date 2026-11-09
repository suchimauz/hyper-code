/** Returns owner-only update state and cookie-bound CSRF token without applying changes. */
export default async function(ctx: Context, session: Session | null, opts: { /** Incoming status request; check=1 explicitly fetches upstream. */ req: Request; /** Route parameters. */ params: Record<string,string> }) {
    if (session?.user?.role !== 'owner') return Response.json({error:'Owners only'},{status:403});
    const status = await ctx.fns.update.check({fetch:new URL(opts.req.url).searchParams.get('check') === '1'});
    return Response.json({status, csrfToken:await ctx.fns.auth.csrfToken({req:opts.req})},{headers:{'Cache-Control':'no-store'}});
}
