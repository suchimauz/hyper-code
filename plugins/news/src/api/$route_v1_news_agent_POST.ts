/** Starts a News-focused agent using a JSON-body item identifier safe for URL-shaped IDs. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const denied = await ctx.fns.news.authorizeUi({req:opts.req}); if (denied) return denied;
    const body = await opts.req.json() as { confirmed?: boolean; id?: string; prompt?: string };
    if (!body.id) return Response.json({ error: "invalid_request", message: "id is required" }, { status: 400 });
    if(body.confirmed!==true)return Response.json({error:'Explicit confirmation required'},{status:400});
    const result = await ctx.fns.news.startAgent({ id: body.id, prompt: body.prompt, run: true });
    return Response.json({ version: 1, ...result });
}
