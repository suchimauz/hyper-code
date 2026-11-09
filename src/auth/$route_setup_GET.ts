/**
 * Renders first-user setup: confirm your name, optionally email and password.
 *
 * Available while there are no users, or while the lone user was seeded (from env or the
 * legacy password) without a confirmed name. Otherwise redirects home.
 * Accept application/json for the public form model, behind the same availability checks.
 * @param opts.req Incoming request; Accept selects HTML or JSON presentation.
 * @param opts.params Router parameters (unused).
 */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    if (await ctx.fns.auth.oidcOnly({})) return new Response(null, { status: 303, headers: { location: "/auth/login", "cache-control": "no-store" } });
    const users = await ctx.fns.auth.listUsers({});
    const lone = users.length === 1 ? users[0]! : null;
    if (users.length > 1 || (lone && lone.configuredAt != null)) return new Response(null, { status: 303, headers: { location: "/" } });
    // A legacy shared-password install is switched over with `bun script/multiuser.ts up`, not from the web.
    if (!lone && (await ctx.fns.auth.password({}))) return new Response(null, { status: 303, headers: { location: "/auth/login" } });
    const guess = lone?.name && lone.name !== "Owner" ? lone.name : String(ctx.env.HYPER_USER ?? ctx.env.USER ?? "");
    const needsCurrent = !!lone?.hasPassword;
    const error = new URL(opts.req.url).searchParams.get("error");
    if ((opts.req.headers.get("accept") ?? "").includes("application/json")) return Response.json({ kind: "setup", name: guess, email: lone?.email ?? "", needsCurrent, error }, { headers: { "cache-control": "no-store", vary: "Accept" } });
    return ctx.fns.auth.reactDocument({});
}
