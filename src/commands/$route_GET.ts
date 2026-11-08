/** Discover supported composer commands without running a model. */
export default async function(ctx: Context, _session: Session | null, opts: { /** Incoming browser request. */ req: Request }) {
    return ctx.fns.commands.http({req:opts.req});
}
