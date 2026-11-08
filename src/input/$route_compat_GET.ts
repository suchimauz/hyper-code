/** Serve the owner-bound React input compatibility document or metadata list. */
export default async function(ctx: Context, _session: Session | null, opts: {
    /** Incoming authenticated browser request. */
    req: Request;
}): Promise<Response> {
    return ctx.fns.input.compatView({req: opts.req});
}
