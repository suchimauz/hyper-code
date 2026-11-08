/**
 * Return inert provider marks for every quota provider, keyed by provider id
 *
 * Use for React quota cards and other provider badges that need native Hyper logos without injecting SVG markup.
 * Reads the unified quota list to discover providers and maps each one through frontendBridge.iconData; unknown providers map to null.
 * @param opts.req Incoming authenticated GET request.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Incoming authenticated GET request. */
        req: Request;
    },
): Promise<Response> {
    const headers = { 'Cache-Control': 'private, max-age=300', 'Vary': 'Cookie' };
    if (opts.req.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { ...headers, Allow: 'GET' } });
    const base = ['codex', 'claude-code', 'anthropic-oauth', 'kimi-coding', 'xai', 'opencode', 'zai-coding', 'minimax-coding', 'oneapi'];
    let discovered: string[] = [];
    try { discovered = (await ctx.fns.llms.quotaData({})).accounts.map(a => a.provider); } catch { discovered = []; }
    const providers = [...new Set([...base, ...discovered])];
    const icons = Object.fromEntries(await Promise.all(providers.map(async p => {
        try { return [p, await ctx.fns.frontendBridge.iconData({ model: `${p}:x` })] as const; } catch { return [p, null] as const; }
    })));
    return Response.json({ icons }, { headers });
}
