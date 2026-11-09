/** Sends one explicitly confirmed personal Telegram message from the Hyper Telegram client. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {

    const who = await ctx.fns.auth.currentUser({ req: opts.req });
    const { user } = who;
    if (who.required && !user && !who.legacy) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (user && user.role !== "owner") return Response.json({ error: "Owner access required" }, { status: 403 });
    if (!(await ctx.fns.auth.verifyCsrf({ req: opts.req, token: opts.req.headers.get("x-csrf-token") ?? "" }))) return Response.json({ error: "Invalid CSRF token" }, { status: 403 });
    let body: any;
    try { body = await opts.req.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
    const chat = String(body?.chat ?? "").trim();
    const text = String(body?.text ?? "").trim();
    if (!chat || !text) return Response.json({ error: "chat and text are required" }, { status: 400 });
    if (body?.confirm !== true) return Response.json({ error: "explicit confirmation required" }, { status: 409 });
    const message = await ctx.fns.telegram.send({ chat, text, confirm: true });
    return Response.json({ message });
}
