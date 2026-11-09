/** JSON feed for the calendar page: ?from=&to= ISO dates, merged across accounts and calendars. */
export default async function (ctx: Context, _session: Session | null, opts: { /** Incoming HTTP request. */ req: Request }) {
    const u = new URL(opts.req.url);
    if (u.searchParams.has('itemId') || u.searchParams.has('agentId')) {
        const agentId = u.searchParams.get('agentId') ?? '';
        const denied = await ctx.fns.canvas.authorizeHttp({ req: opts.req, agentId });
        if (denied) return denied;
        const itemId = Number(u.searchParams.get('itemId'));
        if (!(await ctx.fns.canvas.list({ agentId })).some(item => item.id === itemId && item.kind === 'gcal.calendar')) return new Response('No such canvas item', { status: 404 });
    }
    const from = u.searchParams.get("from"), to = u.searchParams.get("to");
    if (!from || !to || isNaN(Date.parse(from)) || isNaN(Date.parse(to))) return Response.json({ error: "from and to are required ISO dates" }, { status: 400 });
    try { return Response.json(await ctx.fns.gcal.agenda({ from, to })); }
    catch (e: any) { return Response.json({ error: String(e?.message ?? e) }, { status: 502 }); }
}
