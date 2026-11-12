/** Read snapshots, documents or validation results from an authorized open OpenSpec Canvas tab. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Browser request identifying the agent, owned Canvas item and fixed read operation. */
    req: Request;
}): Promise<Response> {
    return ctx.fns.openspec.handle({ req: opts.req });
}
