/** Serve install metadata for launching MauzCode as a standalone home-screen web app. */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Incoming manifest request. */ req: Request;
    /** Route parameters. */ params: Record<string, string>;
}): Promise<Response> {
    return new Response(JSON.stringify({
        id: "/", name: "MauzCode", short_name: "MauzCode", start_url: "/", scope: "/",
        display: "standalone", background_color: "#252a34", theme_color: "#252a34",
        icons: [192, 512].map(size => ({ src: `/ui/app-icon?size=${size}`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })),
    }), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" } });
}
