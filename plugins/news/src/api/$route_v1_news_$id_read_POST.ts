/** Marks one native news item read. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const denied = await ctx.fns.news.authorizeUi({req:opts.req}); if (denied) return denied;
    const result = await ctx.fns.news.setRead({ ids: [opts.params.id!], read: true });
    return Response.json({ version: 1, id: opts.params.id!, read: true, updated: result.updated });
}
