/** GET /dock/running — refresh the read-only strip of currently running navigation chats. */
export default async function (ctx: Context, _session: Session | null, _opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    return new Response(await ctx.fns.dock.runningAgents({}), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
