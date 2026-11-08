/** Review one exact plan through an authenticated human browser action. */
export default async function(ctx: Context, _session: Session | null, opts: { /** Incoming browser request. */ req: Request; /** Session route identifier. */ params: Record<string,string> }) {
    return ctx.fns.planning.http({req:opts.req,agentId:opts.params.id!});
}
