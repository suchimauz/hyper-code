/** Refresh the RAM-only partial response region without reading or writing transcript storage.
 * @param opts.req Incoming fragment request.
 * @param opts.params Agent identifier bound by the route.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming fragment request. */ req: Request;
    /** Agent identifier bound by the route. */ params: Record<string, string>;
}) {
    const id = opts.params.id!;
    if (!ctx.state.agent[id]) return new Response('not found', { status: 404 });
    return new Response(await ctx.fns.agent.renderTransientStream({ agentId: id }), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
}
