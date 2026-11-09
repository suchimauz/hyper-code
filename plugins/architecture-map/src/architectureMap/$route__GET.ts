/** GET /architecture-map — live interactive view over Hyper's indexed call graph. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const url = new URL(opts.req.url);
    if (url.searchParams.has('itemId') || url.searchParams.has('agentId')) {
        const agentId = url.searchParams.get('agentId') ?? '';
        const denied = await ctx.fns.canvas.authorizeHttp({ req: opts.req, agentId });
        if (denied) return denied;
        const itemId = Number(url.searchParams.get('itemId'));
        if (!(await ctx.fns.canvas.list({ agentId })).some(item => item.id === itemId && item.kind === 'architectureMap.map')) return new Response('No such canvas item', { status: 404 });
    }
    const scope = ["all", "core", "plugins"].includes(url.searchParams.get("scope") ?? "") ? url.searchParams.get("scope")! : "all";
    const minWeight = Math.max(1, Math.min(50, Number(url.searchParams.get("minWeight")) || 2));
    const json = opts.req.headers.get("accept")?.includes("application/json");
    if (!json) {
        const query = new URLSearchParams({ view: "extension:visualizations/architecture", scope, minWeight: String(minWeight) });
        return new Response(null, { status: 302, headers: { Location: `/?${query}` } });
    }
    const [graph, boundary] = await Promise.all([
        ctx.fns.architectureMap.graph({ minWeight, limit: 160 }),
        ctx.fns.code.boundary({ limit: 1000 }),
    ]);
    if (json) return Response.json({ graph, boundary, scope });
    return Response.json({ graph, boundary, scope });
}
