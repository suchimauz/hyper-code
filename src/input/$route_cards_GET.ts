/** Serve owner-only safe metadata and explicitly projected specs for React input cards. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Authenticated browser GET request with agentId query parameter. */
    req: Request;
}): Promise<Response> {
    return ctx.fns.input.cards({ req: opts.req });
}
