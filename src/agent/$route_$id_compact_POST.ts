/** Compact from the native popup using the shared durable command lifecycle. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming form with optional instructions and retry key. */ req: Request;
    /** Session route identifier. */ params: Record<string, string>;
}) {
    return ctx.fns.commands.compactHttp({req:opts.req,agentId:opts.params.id!,popup:true});
}
