/**
 * Return the runtime plugin UI manifest for the React shell.
 * @param opts.req Authenticated browser request.
 */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Authenticated browser request. */ req: Request;
}): Promise<Response> {
    const headers = { 'Cache-Control': 'no-store', 'Vary': 'Cookie' };
    const user = (session as Session & { user?: { id: string; role?: string } })?.user;
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
    try {
        const manifest = await ctx.fns.plugins.uiManifest({});
        const owner = user.role === 'owner';
        return Response.json({ ...manifest, pending: owner ? manifest.pending : [], csrfToken: owner ? await ctx.fns.auth.csrfToken({ req: opts.req }) : undefined }, { headers });
    } catch { return Response.json({ error: 'Plugin UI manifest unavailable' }, { status: 500, headers }); }
}
