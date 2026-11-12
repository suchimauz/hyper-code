/**
 * Atomically remove a saved proxy and its owned encrypted secret
 *
 * Use for owner deletion with optimistic concurrency. Missing records succeed idempotently; stale revisions never remove a live record.
 * @param opts.id Stable server-generated proxy UUID.
 * @param opts.revision Last observed positive integer revision for optimistic concurrency. @minimum 1
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Stable server-generated proxy UUID. */
        id: string;
        /** Last observed positive integer revision for optimistic concurrency. @minimum 1 */
        revision: number;
    },
): Promise<{ok:true}> {
    await ctx.fns.socksProxy.validateIdentity(opts);if(opts.revision===undefined)throw Object.assign(new Error('Revision required'),{status:400});return await ctx.fns.procs.db.transaction({fn:async()=>{const rows=await ctx.fns.procs.db.select({sql:'SELECT * FROM socks_proxies WHERE id=? FOR UPDATE',params:[opts.id]});const row=rows[0];if(!row)return {ok:true as const};if(row.revision!==opts.revision)throw Object.assign(new Error('Proxy changed'),{status:409});if(row.credential_ref){if(row.credential_ref!=='secret://socksProxy/'+row.id)throw new Error('Invalid credential ownership');await ctx.fns.secrets.deleteLocal({namespace:'socksProxy',name:row.id});}await ctx.fns.procs.db.run({sql:'DELETE FROM socks_proxies WHERE id=?',params:[row.id]});return {ok:true as const};}}) as {ok:true};
}
