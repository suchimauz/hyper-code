/** Redirect retired standalone Canvas links to the owner-authorized React agent workspace.
 * Keeps the existing Canvas state unchanged; the React shell owns its tabs and mobile presentation.
 * @param opts.req Incoming request used for authentication and ownership checks.
 * @param opts.params Route parameters containing the target agent id.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming request used for authentication and ownership checks. */
    req: Request;
    /** Route parameters containing the target agent id. */
    params: Record<string, string>;
}): Promise<Response> {
    const agentId = String(opts.params.id ?? "");
    const denied = await ctx.fns.canvas.authorizeHttp({ req: opts.req, agentId });
    if (denied) return denied;
    return new Response(null, { status: 302, headers: {
        location: `/?agent=${encodeURIComponent(agentId)}`,
        "cache-control": "no-store",
    } });
}
