// GET /canvas/:id/state — the canvas view (open, width, active tab) and panel fingerprint of one agent.
// canvas.js reads it when a tab becomes visible again or its event stream reconnects: a hidden tab has no
// event stream, so whatever the agent did meanwhile (opened a drawing, switched tabs) is caught up here.
/** Return authorized Canvas tabs, revision and a cookie-bound token for native React operations. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    const agentId = String(opts.params.id ?? "");
    const denied = await ctx.fns.canvas.authorizeHttp({ req: opts.req, agentId });
    if (denied) return denied;
    const [view, rev, items] = await Promise.all([ctx.fns.canvas.get({ agentId }), ctx.fns.canvas.revision({ agentId }), ctx.fns.canvas.list({ agentId })]);
    const tabs = items.map(item => ({ id: item.id, title: item.title, kind: item.kind, args: item.args, state: item.state, active: item.active, icon: ctx.state.canvas?.kinds?.[item.kind]?.icon ?? 'square' }));
    return Response.json({ ...view, rev: rev.panel, items: tabs, csrfToken: await ctx.fns.auth.csrfToken({ req: opts.req }) }, { headers: { "cache-control": "no-store", "vary": "Cookie" } });
}
