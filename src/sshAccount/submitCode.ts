/**
 * Send a Claude authorization code directly into remote CLI stdin
 *
 * Streams a bounded one-time code to the SSH child process without persistence or command-line interpolation. Only pending Claude flows accept codes.
 * @param opts.id Opaque identifier returned by startLogin.
 * @param opts.code One-time browser code; never logged or persisted.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Opaque identifier returned by startLogin. */
        id: string;
        /** One-time browser code; never logged or persisted. */
        code: string;
    },
): Promise<{ok:true}> {
    await ctx.fns.sshAccount.requireOwner({});const f=ctx.state.sshAccount?.flows?.get(opts.id);if(!f||f.provider!=='claude-code'||f.status!=='pending'||!f.process||Date.now()>f.expiresAt)throw new Error('Authorization not pending');if(!opts.code||opts.code.length>4096||/[\r\n\x00]/.test(opts.code))throw new Error('Invalid one-time code');f.process.stdin.write(opts.code+'\n');await f.process.stdin.flush();return {ok:true};
}
