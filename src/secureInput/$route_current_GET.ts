/** Returns protected native transient dialog metadata. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request }): Promise<Response> {
    return ctx.fns.secureInput.current({ req: opts.req });
}
