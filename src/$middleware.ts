// Global application middleware: user sign-in gate plus current-screen tracking.
// Sign-in is required once a user has a password (DESIGN §34). A lone user without one keeps
// today's open local behavior but is still attached to the session, so authorship is recorded.
export default async function (ctx: Context, session: Session | null, opts: { req: Request }): Promise<Response | void> {
    const url = new URL(opts.req.url);
    // Browsers opening a page over plain HTTP go to the HTTPS/HTTP2 address.
    const toHttps = ctx.fns.h2.redirect({ req: opts.req });
    if (toHttps) return toHttps;
    // Dedicated bridge owns its narrow authentication. Its bearer is never a UI/REPL credential.
    if (url.pathname.startsWith('/sidebar/api/')) return ctx.fns.sidebar.bridge({ req: opts.req });
    if (url.pathname.startsWith('/sidebar/approve/')) return ctx.fns.sidebar.approval({ req: opts.req });
    const publicPath = url.pathname === "/auth/login" || url.pathname === "/auth/logout" || url.pathname === "/auth/setup" || url.pathname === "/auth/google" || url.pathname === "/auth/google/callback" || url.pathname === "/auth/oidc" || url.pathname === "/auth/oidc/callback" || url.pathname === "/auth/mobile/exchange" || url.pathname === "/favicon.ico" || (["GET", "HEAD"].includes(opts.req.method) && ["/ui/app-icon", "/ui/manifest.webmanifest", "/webPush/web-push-sw.js", "/ui/vendor/medeo.css", "/ui/vendor/medeo-sans.woff2", "/ui/vendor/medeo-sans-italic.woff2", "/ui/vendor/medeo-mono.woff2", "/ui/vendor/medeo-mono-italic.woff2"].includes(url.pathname));
    // /procs/repl, /external/* and /node/v1/* check loopback + their own scoped tokens.
    const infrastructurePath = url.pathname === "/procs/repl" || url.pathname.startsWith("/external/") || url.pathname.startsWith("/node/v1/");
    const who = publicPath || infrastructurePath ? null : await ctx.fns.auth.currentUser({ req: opts.req });
    if (session && who?.user) (session as any).user = who.user;
    if (session && who?.setCookie) (session as any).setCookie = who.setCookie;
    if (who?.required) {
    if (url.pathname.startsWith('/sidebar/draft/')) return ctx.fns.sidebar.draft({ req: opts.req });
        {
            const user = who.user;
            if (!user && !who.legacy) {
                const wantsHTML = (opts.req.headers.get("accept") ?? "").includes("text/html") && opts.req.method === "GET";
                if (wantsHTML) return new Response(null, { status: 303, headers: { location: `/auth/login?next=${encodeURIComponent(url.pathname + url.search)}`, "cache-control": "no-store" } });
                return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401, headers: { "cache-control": "no-store" } });
            }
            if (!["GET", "HEAD", "OPTIONS"].includes(opts.req.method.toUpperCase())) {
                const origin = opts.req.headers.get("origin");
                const expectedOrigin = await ctx.fns.http.publicOrigin({ req: opts.req });
                if (origin !== null) {
                    // Opaque ("null") and malformed origins are untrusted, not server errors.
                    // Require an HTTP(S) serialized origin, not an arbitrary URL with a matching host.
                    let parsedOrigin: URL | null = null;
                    try { parsedOrigin = new URL(origin); } catch { parsedOrigin = null; }
                    if (!parsedOrigin || !["http:", "https:"].includes(parsedOrigin.protocol)
                        || parsedOrigin.origin !== origin || parsedOrigin.origin !== expectedOrigin) {
                        return Response.json({ error: "cross_origin", message: "Cross-origin write rejected" }, { status: 403 });
                    }
                }
            }
        }
    }

    if (opts.req.method !== "GET") return;
    const agent = /^\/(?:a|agent)\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1];
    if (!agent || agent === "new") return;
    const state = ((ctx.state as any).screen ??= { nextId: 1, pending: new Map() });
    state.here = { url: url.pathname + url.search, agentId: agent, at: new Date().toISOString() };
}
