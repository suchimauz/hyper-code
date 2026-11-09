/** Return read-only account quota and catalogue data for the mobile overview, using the desktop data source. */
export default async function (ctx: Context, _session: Session | null, _opts: {
    /** Incoming authenticated UI request; authentication is enforced by the application middleware. */
    req: Request;
}): Promise<Response> {
    const { entries, gateway } = await ctx.fns.llms.quotaData({});
    return Response.json({ entries, gateway }, { headers: { 'cache-control': 'no-store' } });
}
