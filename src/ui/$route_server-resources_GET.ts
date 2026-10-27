/** Serve a no-store server resource snapshot behind the application's sign-in middleware. */
export default async function (ctx: Context, _session: Session | null, _opts: {
    /** HTTP request authenticated by the global application middleware. */ req: Request;
}): Promise<Response> {
    try {
        return Response.json(await ctx.fns.resources.collectSnapshot({}), { headers: { 'cache-control': 'no-store' } });
    } catch (cause) {
        await ctx.fns.procs.log.warn({ event: 'resources.snapshot.unavailable', msg: 'Server resource snapshot unavailable', error: String(cause) });
        return Response.json({ error: 'resource_snapshot_unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
}
