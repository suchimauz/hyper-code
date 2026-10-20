/**
 * Cancel a pending remote CLI authorization process
 *
 * Stops a live SSH authorization and marks the durable account metadata failed without deleting any remote credentials.
 * @param opts.id Opaque identifier returned by startLogin.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Opaque identifier returned by startLogin. */
        id: string;
    },
): Promise<{ok:true}> {
    await ctx.fns.sshAccount.requireOwner({});const f=ctx.state.sshAccount?.flows?.get(opts.id);if(f&&f.status==='pending'){f.status='cancelled';f.error='Authorization cancelled';f.process?.kill();await ctx.fns.sshAccount.registry({action:'fail',instance:f.instance,provider:f.provider,account:f.account});ctx.fns.procs.events.refresh({topic:'ssh-accounts'});}return {ok:true};
}
