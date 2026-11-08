/**
 * Forward a remote login callback without echoing it
 *
 * Forward a verified callback privately over SSH and replace the popup with safe progress.
 * @param opts.id Opaque remote authorization identifier.
 * @param opts.code Full browser callback URL; never persisted.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Opaque remote authorization identifier. */
        id: string;
        /** Full browser callback URL; never persisted. */
        code: string;
    },
): Promise<string> {
    await ctx.fns.sshAccount.submitCode(opts);return ctx.fns.sshAccount.progressPopup({id:opts.id});
}
