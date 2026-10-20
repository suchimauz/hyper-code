/**
 * Cancel remote CLI authorization from its progress popup
 *
 * Stop the pending authorization and return safe cancellation status.
 * @param opts.id Opaque remote authorization identifier.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Opaque remote authorization identifier. */
        id: string;
    },
): Promise<string> {
    await ctx.fns.sshAccount.cancel(opts);return ctx.fns.sshAccount.progressPopup(opts);
}
