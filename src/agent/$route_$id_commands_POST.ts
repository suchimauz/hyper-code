/** Dispatch a structured composer command with CSRF and durable idempotency. */
export default async function(ctx: Context, _session: Session | null, opts: { /** Incoming browser request. */ req: Request; /** Session route identifier. */ params: Record<string,string> }) {
    return ctx.fns.commands.http({req:opts.req,agentId:opts.params.id!});
}
