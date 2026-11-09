/** Return authenticated, secret-free JSON for the native instance directory. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    return ctx.fns.controlPlane.overview({ req: opts.req });
}
