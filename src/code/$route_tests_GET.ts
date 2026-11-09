/** Return the last test report as JSON for the native Tests canvas. Reject non-owner sessions before reading reports. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request }) {
    if (_session?.user?.role !== "owner") return Response.json({ error: "Owner access required" }, { status: 403 });
    const params = new URL(opts.req.url).searchParams;
    const kind = params.get("kind") ?? "fast";
    if (!["fast", "it", "live", "all"].includes(kind)) return Response.json({ error: "invalid kind" }, { status: 400 });
    return Response.json(await ctx.fns.code.tests({ kind: kind as types.code.TestKind, picked: params.get("picked") === "1" }));
}
