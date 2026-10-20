/**
 * Reads one secret-free SSH instance by name
 *
 * Use before connection or administration; throws for unknown names and never returns private key material.
 * @param opts.name Exact configured instance name.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact configured instance name. */
        name: string;
    },
): Promise<types.sshInstance.Instance> {
    const found=(await ctx.fns.sshInstance.list({})).find(r=>r.name===opts.name); if(!found) throw new Error('Unknown SSH instance'); return found;
}
