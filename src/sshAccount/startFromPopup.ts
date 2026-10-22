/**
 * Start remote authorization from its Administration popup
 *
 * Launch an isolated account authorization and return its safe progress form.
 * Codex and Claude Code run their official CLI on the remote host; Kimi Coding
 * runs only its OAuth device flow here and ships the granted credential over the
 * pinned connection, so nothing is executed on the host.
 * @param opts.instance Configured SSH instance name.
 * @param opts.provider Installed official CLI provider, or Kimi Coding.
 * @param opts.account Isolated account slot name.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Configured SSH instance name. */
        instance: string;
        /** Installed official CLI provider, or Kimi Coding. */
        provider: "codex" | "claude-code" | "kimi-coding";
        /** Isolated account slot name. */
        account: string;
    },
): Promise<string> {
    const flow = opts.provider === "kimi-coding"
        ? await ctx.fns.sshAccount.startKimiLogin({ instance: opts.instance, account: opts.account })
        : await ctx.fns.sshAccount.startLogin({ instance: opts.instance, provider: opts.provider as "codex" | "claude-code", account: opts.account });
    return ctx.fns.sshAccount.progressPopup({id:flow.id});
}
