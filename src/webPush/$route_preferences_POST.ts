/** Persist main-agent push preferences from the authenticated owner inspector form.
 * @param opts.req Incoming form POST request.
 * @param opts.params Route parameters (unused).
 */
export default async function(ctx: Context, _session: Session | null, opts: {
    /** Incoming form POST request. */ req: Request;
    /** Route parameters (unused). */ params: Record<string,string>;
}): Promise<Response> {
    return await ctx.fns.webPush.savePreferences({req: opts.req});
}
