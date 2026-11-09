/** Open the native browser live extension after validating the requested CDP endpoint. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request }) {
    if (_session?.user?.role !== "owner") return Response.json({ error: "Owner access required" }, { status: 403 });
    const url = new URL(opts.req.url);
    try { await ctx.fns.browser.liveCdp({ requested: url.searchParams.get("cdp") ?? undefined }); }
    catch (e) { return new Response(e instanceof Error ? e.message : String(e), { status: 403 }); }
    const query = new URLSearchParams({ view: "extension:browser/live" });
    for (const key of ["target", "cdp"]) { const value = url.searchParams.get(key); if (value) query.set(key, value); }
    return new Response(null, { status: 302, headers: { location: `/?${query}` } });
}
