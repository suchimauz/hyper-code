/**
 * Forward a remote login one-time code without echoing it
 *
 * Stream a browser code into the remote CLI and replace the popup with safe progress.
 * @param opts.id Opaque remote authorization identifier.
 * @param opts.code One-time browser code; never persisted.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Opaque remote authorization identifier. */
        id: string;
        /** One-time browser code; never persisted. */
        code: string;
    },
): Promise<string> {
    await ctx.fns.sshAccount.submitCode(opts);return ctx.fns.sshAccount.progressPopup({id:opts.id});
}
