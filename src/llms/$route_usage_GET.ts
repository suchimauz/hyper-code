/** Return read-only quota data for native consumers; HTML fragments are retired. */
export default async function (ctx: Context, _session: Session | null, _opts: {
    /** Incoming authenticated request; application middleware enforces access. */ req?: Request;
}): Promise<Response> {
    const { entries, gateway } = await ctx.fns.llms.quotaData({});
    return Response.json({ entries, gateway }, { headers: { 'Cache-Control': 'no-store' } });
}
