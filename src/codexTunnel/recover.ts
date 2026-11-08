/**
 * Retry only the CAS of a rotated token held in this worker's volatile recovery slot.
 *
 * Retry only the CAS of a rotated token held in this worker's volatile recovery slot.
Never repeats remote refresh after ambiguous response; restart requires reauthorization.
 * @param opts.ssh Explicit ssh input for this account operation.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit ssh input for this account operation. */
        ssh: {instance:string;provider:'codex';account:string};
    },
): Promise<any> {
    return (ctx as any).fns.codexTunnel.service({}).recover(opts.ssh)
}
