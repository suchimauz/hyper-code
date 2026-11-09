/**
 * Renders sign-in: password only while there is a single user, email and password with more,
 * plus "Sign in with Google" when Google sign-in is configured. Redirects to setup when no user
 * can sign in yet. In OIDC-only mode shows just the provider button.
 * Accept application/json to read only the public presentation model, with identical redirects.
 * @param opts.req Incoming request; Accept selects HTML or the public JSON presentation.
 * @param opts.params Router parameters (unused).
 */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const url = new URL(opts.req.url);
    const next = url.searchParams.get("next") || "/";
    const json = (opts.req.headers.get("accept") ?? "").includes("application/json");
    const users = await ctx.fns.auth.listUsers({});
    const legacy = users.length === 0 && !!(await ctx.fns.auth.password({}));
    const google = await ctx.fns.auth.googleConfig({});
    const oidc = await ctx.fns.auth.oidcConfig({});
    if (await ctx.fns.auth.oidcOnly({})) {
        const err = url.searchParams.get("error");
        if (json) return Response.json({ kind: "login", next, message: "Sign in to continue.", error: err && err !== "1" ? err : null, showPassword: false, needsEmail: false, google: null, oidc: oidc ? { label: oidc.label } : null, providerUnavailable: !oidc }, { headers: { "cache-control": "no-store", vary: "Accept" } });
        return ctx.fns.auth.reactDocument({});
    }
    if (!legacy && !google && !oidc && (users.length === 0 || (users.length === 1 && !users[0]!.canSignIn))) {
        return new Response(null, { status: 303, headers: { location: "/auth/setup", "cache-control": "no-store" } });
    }
    const single = users.length <= 1;
    const error = url.searchParams.get("error");
    const showPassword = legacy || users.some((u) => u.hasPassword);
    if (json) return Response.json({ kind: "login", next, message: users.length === 1 ? `Sign in as ${users[0]!.name}.` : single ? "Enter the access password." : "Sign in to continue.", error: error === "1" ? `Invalid ${single ? "password" : "email or password"}.` : error, showPassword, needsEmail: !single, google: google ? { domain: google.domain } : null, oidc: oidc ? { label: oidc.label } : null, providerUnavailable: false }, { headers: { "cache-control": "no-store", vary: "Accept" } });
    return ctx.fns.auth.reactDocument({});
}
