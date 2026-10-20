/**
 * Start remote authorization from its Administration popup
 *
 * Launch an isolated CLI authorization and return its safe progress form.
 * @param opts.instance Configured SSH instance name.
 * @param opts.provider Installed official CLI provider.
 * @param opts.account Isolated account slot name.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Configured SSH instance name. */
        instance: string;
        /** Installed official CLI provider. */
        provider: "codex" | "claude-code";
        /** Isolated account slot name. */
        account: string;
    },
): Promise<string> {
    const flow=await ctx.fns.sshAccount.startLogin(opts);return ctx.fns.sshAccount.progressPopup({id:flow.id});
}
