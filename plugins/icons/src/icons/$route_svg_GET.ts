/** Return a bundled icon as JSON, never executable markup in the host document. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request }) {
    const name = new URL(opts.req.url).searchParams.get("name") ?? "";
    try { return Response.json(await ctx.fns.icons.get({ name })); }
    catch { return Response.json({ error: "Unknown icon" }, { status: 404 }); }
}
