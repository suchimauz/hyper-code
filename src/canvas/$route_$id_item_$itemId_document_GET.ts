/** Serves one authenticated agent-bound Canvas item without the legacy application shell. */
export default async function(ctx: Context, _session: Session | null, opts: {
    /** Incoming authenticated HTTP request. */ req: Request;
    /** Agent id and itemId route parameters. */ params: Record<string, string>;
}): Promise<Response> {
    const itemId = Number(opts.params.itemId);
    if (!Number.isSafeInteger(itemId) || itemId < 1) return new Response('Invalid item id', {status:400});
    const denied = await ctx.fns.canvas.authorizeHttp({ req: opts.req, agentId: String(opts.params.id ?? '') });
    if (denied) return denied;
    const item = (await ctx.fns.canvas.list({ agentId: String(opts.params.id ?? '') })).find(value => value.id === itemId);
    if (item?.kind === 'file') {
        // Only the stored, owner-bound path is accepted; query-string paths are never used.
        const response = await ctx.fns.files.rawResponse({ path: String(item.args.path), host: item.args.host && item.args.host !== 'local' ? String(item.args.host) : undefined });
        const headers = new Headers(response.headers);
        // Raw HTML, SVG and PDF must never execute with the application's origin.
        headers.set('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:");
        headers.set('Cross-Origin-Resource-Policy', 'same-origin');
        headers.set('Cache-Control', 'private, no-store');
        if (new URL(opts.req.url).searchParams.get('download') === '1') headers.set('Content-Disposition', 'attachment');
        return new Response(response.body, { status: response.status, headers });
    }
    return ctx.fns.canvas.itemDocument({req:opts.req, agentId:String(opts.params.id ?? ''), itemId});
}
