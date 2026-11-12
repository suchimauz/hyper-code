/**
 * Serve the owner-only model connections overview as JSON.
 * @param opts.req Authenticated owner request.
 * @param opts.params Route parameters (unused).
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    return await ctx.fns.models.api({ req: opts.req });
}
