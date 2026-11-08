/** Serve the legacy application under /old-ui through canonical authenticated dispatch. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request }): Promise<Response | undefined> {
    return ctx.fns.legacyUi.handle({ req: opts.req });
}
