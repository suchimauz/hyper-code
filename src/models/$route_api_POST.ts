/**
 * Run one CSRF-protected JSON model connection action for the owner.
 * @param opts.req Authenticated owner JSON request with x-csrf-token.
 * @param opts.params Route parameters (unused).
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    return await ctx.fns.models.api({ req: opts.req });
}
