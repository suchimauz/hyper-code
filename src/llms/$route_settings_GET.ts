/** Serve owner-only secret-free React model settings. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming authenticated settings request. */ req: Request;
}): Promise<Response> {
    return ctx.fns.llms.settingsApi({ req: opts.req });
}
