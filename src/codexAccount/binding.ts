/**
 * Resolve the pinned SSH identity and stable encrypted Codex credential key
 *
 * Owner-authorized local-only identity resolution used before reading or changing migrated credentials. The secret key stays stable across destination changes so a changed pin or destination fails closed instead of silently returning to Python.
 * @param opts.instance Configured SSH instance name.
 * @param opts.account Isolated Codex account slot.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Configured SSH instance name. */
        instance: string;
        /** Isolated Codex account slot. */
        account: string;
    },
): Promise<{name:string;fingerprint:string;owner:string|null}> {
    await ctx.fns.sshAccount.requireOwner({});
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(opts.instance) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(opts.account)) throw new Error('Invalid Codex account');
    const item = await ctx.fns.sshInstance.get({name:opts.instance});
    if (!item.pinnedHostKey) throw new Error('Codex migration requires a pinned SSH host');
    const hash = (s:string) => new Bun.CryptoHasher('sha256').update(s).digest('hex');
    return {name:hash(JSON.stringify([opts.instance,opts.account])),fingerprint:hash(JSON.stringify([item.id,item.host,item.user,item.port,item.publicKey,item.pinnedHostKey,opts.account])),owner:session?.user?.id ? String(session.user.id) : null};
}
