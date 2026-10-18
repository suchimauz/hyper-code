/**
 * Resolve the current authorized viewer for personal project tabs.
 *
 * Use for project APIs. Never inherits chat creator identity; zero-user instances require a core-authorized HTTP request.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<string> {
    const viewer = await ctx.fns.auth.viewerId({});
    if (viewer) return 'user:' + viewer;
    if (!session?.req) throw new Error('Projects require an authorized viewer');
    const authorization = await ctx.fns.auth.currentUser({req: session.req});
    if (authorization.user) return 'user:' + authorization.user.id;
    const users = await ctx.fns.auth.listUsers({includeDisabled:true});
    if (!users.length && (!authorization.required || authorization.legacy === true)) return 'instance:legacy';
    throw new Error('Projects require an authorized viewer');
}
