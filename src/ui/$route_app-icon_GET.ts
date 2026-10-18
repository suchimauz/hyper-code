/** Serve built-in PNG home-screen icons at fixed sizes for iOS and web app manifests. */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Incoming icon request. */ req: Request;
    /** Requested icon size from the URL. */ params: Record<string, string>;
}): Promise<Response> {
    const size = new URL(opts.req.url).searchParams.get("size") ?? "180";
    if (!["180", "192", "512"].includes(size)) return new Response("Not found", { status: 404 });
    const file = Bun.file(new URL(`./assets/icon-${size}.png`, import.meta.url));
    return new Response(file, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}
