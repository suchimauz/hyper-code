/**
 * Removes a confirmed SSH descriptor and its local account metadata
 *
 * Use after explicit owner confirmation to forget a configured connection. Never contacts the host or revokes authorized_keys. Protected local key directories are retained so already-running processes are not disrupted.
 * @param opts.name Exact stable name of the instance to forget.
 * @param opts.confirmed True only after the owner explicitly confirms removal.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact stable name of the instance to forget. */
        name: string;
        /** True only after the owner explicitly confirms removal. */
        confirmed: boolean;
    },
): Promise<void> {
    await ctx.fns.sshInstance.authorize({});
    if (opts.confirmed !== true) throw new Error('Explicit instance removal confirmation required');
    const previous = await ctx.fns.sshInstance.get({name:opts.name});
    await ctx.fns.sshInstance.replaceDescriptor({previous,next:null});
}
