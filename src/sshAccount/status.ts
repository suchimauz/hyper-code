/**
 * Read safe bounded remote authorization progress
 *
 * Returns only public authorization URL, device code and generic status. After restart orphaned flows fail explicitly; no provider logs or credentials are returned.
 * @param opts.id Opaque identifier returned by startLogin.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Opaque identifier returned by startLogin. */
        id: string;
    },
): Promise<{id:string;instance:string;provider:"codex"|"claude-code";account:string;status:string;verificationUri:string|null;userCode:string|null;error:string|null}> {
    await ctx.fns.sshAccount.requireOwner({}); const flow=ctx.state.sshAccount?.flows?.get(opts.id);if(!flow)throw new Error('Authorization ended or server restarted; start login again');return {id:flow.id,instance:flow.instance,provider:flow.provider,account:flow.account,status:flow.status,verificationUri:flow.verificationUri,userCode:flow.userCode,error:flow.error};
}
