/** Serve owner-only read-only host metrics; details=1 includes bounded Linux processes. */
export default async function(ctx: Context, session: Session | null, opts: {
    /** Incoming authenticated GET request. */ req: Request;
    /** Route parameters (none required). */ params: Record<string, string>;
}) {
    const headers = { 'Cache-Control': 'no-store' };
    if (!session?.user) return Response.json({ error: 'Authentication required' }, { status: 401, headers });
    if (session.user.role !== 'owner') return Response.json({ error: 'Owners only' }, { status: 403, headers });
    try {
        const metrics = await ctx.fns.serverMetrics.sample({ details: new URL(opts.req.url).searchParams.get('details') === '1' });
        return Response.json(metrics, { headers });
    } catch {
        return Response.json({ error: 'Метрики сервера временно недоступны' }, { status: 503, headers });
    }
}
