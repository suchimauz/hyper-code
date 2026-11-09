// GET /nav/items?q=…&tab=…&edit=1 — the global menu (⌘/) body: the tab's widget grid while q is empty,
// grouped results of the tab's search sources once the person types.
/**
 * Return declared application destinations as JSON for React, redirect HTML visits to native Applications.
 * JSON contains only explicitly registered root-relative application links; it never discovers routes or includes chats.
 * @param opts.req Incoming request; Accept application/json selects the application catalogue.
 * @param opts.params Matched route parameters (unused).
 */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    if (opts.req.headers.get("accept")?.includes("application/json")) {
        const items = await ctx.fns.nav.items({ includeAgents: false, limit: 500 });
        return Response.json({ items: items.filter(item => item.href.startsWith('/') && !item.href.startsWith('//') && !/[\\\\\u0000-\u001f]/.test(item.href)) }, { headers: { "cache-control": "no-store" } });
    }
    return new Response(null, { status: 302, headers: { Location: '/?view=applications', 'Cache-Control': 'no-store' } });
}
