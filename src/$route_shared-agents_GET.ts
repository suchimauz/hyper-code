/** Return owner-only Shared Agents data, or redirect browser visits to the React extension.
 * @param opts.req Incoming request; Accept application/json selects registry data.
 * @param opts.params Unused route parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const headers = { 'cache-control': 'no-store', vary: 'Accept, Cookie' };
    if (session?.user?.role !== 'owner') return Response.json({ error: 'Only owners can manage shared agents' }, { status: 403, headers });
    const url = new URL(opts.req.url);
    if (!opts.req.headers.get('accept')?.includes('application/json')) {
        const query = new URLSearchParams({ view: 'extension:shared-agents/overview' });
        for (const key of ['from', 'agent']) if (url.searchParams.get(key)) query.set(key, url.searchParams.get(key)!);
        return new Response(null, { status: 303, headers: { ...headers, location: `/?${query}` } });
    }
    const agents = await ctx.fns.session.list({});
    const cards = await ctx.fns.sharedAgent.list({ query: url.searchParams.get('q') ?? undefined });
    const rows = await ctx.fns.procs.db.select({ sql: 'SELECT id, title, scratchpad, updated_at FROM agents WHERE archived_at IS NULL AND scratchpad LIKE ? ORDER BY updated_at DESC LIMIT 20', params: ['%"sharedAgentTask"%'] });
    const tasks = rows.flatMap(row => {
        let pad;
        try { pad = typeof row.scratchpad === 'string' ? JSON.parse(row.scratchpad) : row.scratchpad; } catch { return []; }
        if (!pad?.sharedAgentTask) return [];
        return [{ id: String(row.id), title: String(row.title ?? ''), task: String(pad.sharedAgentTask.task ?? ''), status: String(pad.delegation?.status ?? 'working'), summary: String(pad.delegation?.summary ?? ''), result: pad.delegation?.result?.result ?? null, updatedAt: Number(row.updated_at ?? 0) }];
    });
    return Response.json({ agents: agents.map(a => ({ id: a.id, title: a.title })), cards, tasks, csrfToken: await ctx.fns.auth.csrfToken({ req: opts.req }) }, { headers });
}
