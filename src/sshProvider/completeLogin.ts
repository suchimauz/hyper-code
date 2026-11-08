/**
 * Securely onboard a newly authorized SSH OAuth account into encrypted SOCKS storage
 *
 * Call only after an owner-requested remote OAuth login succeeds and its registry row is connected. Import into the shared encrypted store before exposing success. Existing records are never overwritten or reimported; failures require explicit recovery and must mark login failed.
 * @param opts.instance Exact SSH instance from the owner-requested login.
 * @param opts.provider OAuth provider whose fresh login completed.
 * @param opts.account Exact isolated account selected for login.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact SSH instance from the owner-requested login. */
        instance: string;
        /** OAuth provider whose fresh login completed. */
        provider: "codex"|"claude-code"|"kimi-coding";
        /** Exact isolated account selected for login. */
        account: string;
    },
): Promise<void> {
    try { await ctx.fns.sshProvider.activate({...opts,action:'activate',confirmed:true,drained:true}); } catch { throw Error('SSH login requires secure onboarding or recovery of the existing encrypted account; no HTTP fallback.'); }
}
