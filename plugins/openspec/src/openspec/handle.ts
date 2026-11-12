/**
 * Serve owned OpenSpec Canvas reads and CSRF-protected workspace tab opening.
 *
 * Use for the OpenSpec GET and POST routes. Authorizes the agent on every request and derives read directories only from owned open OpenSpec items; browser paths and hosts are never used. GET ops: snapshot (also touches the watcher), watch (keep-alive returning the live key), doc, validate.
 * @param opts.req Incoming browser request with agentId and, for reads, itemId and op.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming browser request with agentId and, for reads, itemId and op. */
        req: Request;
    },
): Promise<Response> {
    const req = opts.req;
    const url = new URL(req.url);
    const agentId = url.searchParams.get('agentId') || '';
    const headers = { 'Cache-Control': 'no-store' };
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(agentId)) return new Response('Invalid agent', { status: 400, headers });
    const denied = await ctx.fns.canvas.authorizeHttp({ req, agentId });
    if (denied) return denied;
    try {
        if (req.method === 'POST') {
            if (!(await ctx.fns.auth.verifyCsrf({ req, token: req.headers.get('x-csrf-token') || '' }))) return new Response('Invalid CSRF token', { status: 403, headers });
            return Response.json(await ctx.fns.canvas.show({ agentId, kind: 'openspec.workspace', args: {} }), { headers });
        }
        if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { ...headers, Allow: 'GET, POST' } });
        const itemId = Number(url.searchParams.get('itemId'));
        if (!Number.isSafeInteger(itemId) || itemId <= 0) return new Response('Invalid item', { status: 400, headers });
        const item = (await ctx.fns.canvas.list({ agentId })).find(item => item.id === itemId && item.kind === 'openspec.workspace' && !item.closedAt);
        if (!item) return new Response('Unknown OpenSpec tab', { status: 404, headers });
        const dir = item.args.dir;
        if (typeof dir !== 'string' || !dir.startsWith('/') || dir.includes('\0')) throw new Error('Invalid OpenSpec workspace');
        const op = url.searchParams.get('op') || 'snapshot';
        if (op === 'snapshot') {
            await ctx.fns.openspec.watch({ dir });
            return Response.json(await ctx.fns.openspec.snapshot({ dir }), { headers });
        }
        if (op === 'watch') return Response.json(await ctx.fns.openspec.watch({ dir }), { headers });
        if (op === 'doc') return Response.json(await ctx.fns.openspec.document({ dir, id: url.searchParams.get('id') || '' }), { headers });
        if (op === 'validate') return Response.json(await ctx.fns.openspec.validateAll({ dir }), { headers });
        return new Response('Unsupported read operation', { status: 400, headers });
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400, headers });
    }
}
