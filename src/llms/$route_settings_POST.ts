/** Apply owner-only cookie-CSRF protected React model settings. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming authenticated JSON mutation request. */ req: Request;
}): Promise<Response> {
    return ctx.fns.llms.settingsApi({ req: opts.req });
}
