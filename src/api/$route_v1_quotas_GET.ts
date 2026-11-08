/** Return the shared credential-free quota inventory under the standard API authentication middleware. */
export default async function (ctx: Context, _session: Session | null, _opts: { req: Request; params: Record<string, string> }) {
    const { updatedAt, accounts } = await ctx.fns.llms.quotaData({});
    return Response.json({ updatedAt, accounts }, { headers: { "Cache-Control": "no-store" } });
}
