/** Compact through the shared command lifecycle, including request-key replay. */
export default async function (ctx: Context, _session: Session | null, opts: { /** Incoming JSON compact request. */ req: Request; /** Session route identifier. */ params: Record<string, string> }) {
    return ctx.fns.commands.compactHttp({req:opts.req,agentId:opts.params.id!});
}
