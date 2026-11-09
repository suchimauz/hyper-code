/** Accepts protected native transient dialog answers without rendering or persisting the value. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request }): Promise<Response> {
    return ctx.fns.secureInput.submit({ req: opts.req });
}
