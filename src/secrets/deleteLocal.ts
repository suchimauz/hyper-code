/**
 * Delete one exact locally encrypted secret inside the caller transaction
 *
 * Internal backend cleanup for owned credential records. Never expose this helper as an HTTP endpoint; the caller must derive namespace and name from its owned record.
 * @param opts.namespace Owning secret namespace.
 * @param opts.name Exact server-owned secret name.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Owning secret namespace. */
        namespace: string;
        /** Exact server-owned secret name. */
        name: string;
    },
): Promise<void> {
    if(!opts.namespace||!opts.name)throw new Error('Secret identity required'); await ctx.fns.procs.db.run({sql:'DELETE FROM local_secrets WHERE namespace=? AND name=?',params:[opts.namespace,opts.name]});
}
