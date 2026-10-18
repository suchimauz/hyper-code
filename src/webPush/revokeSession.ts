/**
 * Remove Web Push subscriptions belonging to one verified browser login.
 *
 * Call during logout with the cookie before revoking the OIDC session. Invalid cookies do nothing. Never affects another device login.
 * @param opts.token Raw authentication cookie, never logged.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Raw authentication cookie, never logged. */
        token: string;
    },
): Promise<void> {
    const binding=await ctx.fns.webPush.sessionBinding({token:opts.token});
    if(binding) await ctx.fns.procs.db.run({sql:'DELETE FROM web_push_subscriptions WHERE owner_id = ? AND session_key = ?',params:[binding.ownerId,binding.key]});
}
