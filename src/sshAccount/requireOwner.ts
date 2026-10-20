/**
 * Restrict remote account authorization controls to instance owners
 *
 * Use before remote authorization, viewing flow progress or registry mutations. Delegates to the shared SSH owner policy, including request-free internal agent and REPL execution; HTTP and WebSocket callers still require an owner.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<void> {
    await ctx.fns.sshInstance.authorize({});
}
