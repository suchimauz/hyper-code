/** Serves one cached Telegram user avatar, downloading and content-addressing it on first request. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {

    const who = await ctx.fns.auth.currentUser({ req: opts.req });
    const { user } = who;
    if (who.required && !user && !who.legacy) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (user && user.role !== "owner") return Response.json({ error: "Owner access required" }, { status: 403 });
    const userId = String(opts.params.userId ?? "").trim();
    if (!/^\d+$/.test(userId)) return new Response("invalid userId", { status: 400 });
    try {
        const avatar = await ctx.fns.telegram.cacheUserAvatar({ userId });
        if (!avatar) return new Response(null, { status: 404 });
        const file = Bun.file(avatar.storagePath);
        if (!(await file.exists())) return new Response(null, { status: 404 });
        return new Response(file, {
            headers: {
                "content-type": avatar.mimeType,
                "cache-control": "private, max-age=86400, stale-while-revalidate=604800",
                etag: `"${avatar.sha256}"`,
            },
        });
    } catch (error) {
        return Response.json({ error: String((error as Error)?.message ?? error) }, { status: 500 });
    }
}
