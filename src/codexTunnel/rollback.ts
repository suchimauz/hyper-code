/**
 * Return an unrotated account to legacy only under the owner mutation lease.
 *
 * Return an unrotated account to legacy only under the owner mutation lease.
Any refresh or ambiguous state requires external remote token reconciliation; no stale fallback.
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
    return (ctx as any).fns.codexTunnel.service({}).rollback(opts.ssh)
}
