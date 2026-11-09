/** Starts one autonomous News-focused agent with an explicit task from the native reader. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const denied = await ctx.fns.news.authorizeUi({req:opts.req}); if (denied) return denied;
    const body = await opts.req.json() as { confirmed?: boolean; prompt?: string };
    if(body.confirmed!==true)return Response.json({error:'Explicit confirmation required'},{status:400});
    const result = await ctx.fns.news.startAgent({ id: opts.params.id!, prompt: body.prompt, run: true });
    return Response.json({ version: 1, ...result });
}
