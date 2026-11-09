/** GET /code/tests/status — whether a background test run is in progress (code.testRunStatus). */
export default async function (ctx: Context, _session: Session | null, _opts: { req: Request }) {
    if (_session?.user?.role !== "owner") return Response.json({ error: "Owner access required" }, { status: 403 });
    return Response.json({ ...ctx.fns.code.testRunStatus({}), csrfToken: await ctx.fns.auth.csrfToken({ req: _opts.req }) }, { headers: { 'cache-control': 'no-store' } });
}
