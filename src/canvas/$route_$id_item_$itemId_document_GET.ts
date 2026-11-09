/** Serves one authenticated agent-bound Canvas item without the legacy application shell. */
export default async function(ctx: Context, _session: Session | null, opts: {
    /** Incoming authenticated HTTP request. */ req: Request;
    /** Agent id and itemId route parameters. */ params: Record<string, string>;
}): Promise<Response> {
    const itemId = Number(opts.params.itemId);
    if (!Number.isSafeInteger(itemId) || itemId < 1) return new Response('Invalid item id', {status:400});
    const denied = await ctx.fns.canvas.authorizeHttp({ req: opts.req, agentId: String(opts.params.id ?? '') });
    if (denied) return denied;
    return ctx.fns.canvas.itemDocument({req:opts.req, agentId:String(opts.params.id ?? ''), itemId});
}
