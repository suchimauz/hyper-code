// GET /nav/items?q=…&tab=…&edit=1 — the global menu (⌘/) body: the tab's widget grid while q is empty,
// grouped results of the tab's search sources once the person types.
/**
 * Return declared application destinations as JSON for React, or render widget/search fragments for HTML consumers.
 * JSON contains only explicitly registered root-relative application links; it never discovers routes or includes chats.
 * @param opts.req Incoming request; Accept application/json selects the application catalogue.
 * @param opts.params Matched route parameters (unused).
 */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    if (opts.req.headers.get("accept")?.includes("application/json")) {
        const items = await ctx.fns.nav.items({ includeAgents: false, limit: 500 });
        return Response.json({ items: items.filter(item => item.href.startsWith('/') && !item.href.startsWith('//') && !/[\\\\\u0000-\u001f]/.test(item.href)) }, { headers: { "cache-control": "no-store" } });
    }
    const url = new URL(opts.req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const tab = url.searchParams.get("tab")?.trim() || undefined;
    const edit = url.searchParams.get("edit") === "1";
    const html = q ? (await ctx.fns.nav.searchAll({ q, tab })).html : await ctx.fns.nav.home({ tab, edit });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
