/**
 * Returns the current user for native clients and the UI, plus whether sign-in is required.
 * Before the install is switched to users, a valid legacy shared-password session counts as
 * signed in, so existing clients do not appear logged out. canManage is the server's
 * native-owner capability: open installs and valid legacy sessions qualify, members do not.
 * It is a UI hint only; mutation endpoints still enforce authorization and CSRF.
 */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const { user, required, legacy } = await ctx.fns.auth.currentUser({ req: opts.req });
    const users = await ctx.fns.auth.listUsers({});
    const multiuser = users.length > 1;
    const canManage = user ? user.role === 'owner' : !required || legacy === true;
    if (legacy) return Response.json({ authenticated: true, required, multiuser, canManage, user: { name: "Hyper user", role: "owner" } });
    if (!user && required) return Response.json({ authenticated: false, multiuser, canManage: false }, { status: 401 });
    return Response.json({ authenticated: !!user, required, multiuser, canManage, user });
}
