/** Returns recent personal Telegram dialogs for the Hyper Telegram client. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {

    const who = await ctx.fns.auth.currentUser({ req: opts.req });
    const { user } = who;
    if (who.required && !user && !who.legacy) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (user && user.role !== "owner") return Response.json({ error: "Owner access required" }, { status: 403 });
    const url = new URL(opts.req.url);
    const max = Math.max(1, Math.min(200, Number(url.searchParams.get("max") ?? 100)));
    const result = await ctx.fns.telegram.mirror({ maxDialogs: Math.min(max, 100), maxMessages: 1, sessionId: "default" });
    return Response.json({ dialogs: result.dialogs, csrfToken: await ctx.fns.auth.csrfToken({ req: opts.req }) }, { headers: { "cache-control": "no-store" } });
}
