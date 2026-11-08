/**
 * Bind provider account credentials to authenticated owner and pinned SSH identity
 *
 * Resolve the encrypted slot without exposing credentials. Accepts owner sessions and verified durable owner agents, never global browser state. Host, key or owner changes invalidate existing records.
 * @param opts.instance Configured pinned SSH instance name.
 * @param opts.provider Supported subscription provider.
 * @param opts.account Isolated provider account slot.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Configured pinned SSH instance name. */
        instance: string;
        /** Supported subscription provider. */
        provider: string;
        /** Isolated provider account slot. */
        account: string;
    },
): Promise<{name:string;fingerprint:string;owner:string}> {
    const owner=await ctx.fns.codexAccount.inferenceOwner({});
    if(!['codex','claude-code','kimi-coding','zai-coding','minimax-coding','opencode'].includes(opts.provider)||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(opts.instance)||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(opts.account))throw Error('Invalid provider account');
    const item=await ctx.fns.sshInstance.get({name:opts.instance});if(!item.pinnedHostKey)throw Error('Pinned SSH host required');
    const hash=(s:string)=>new Bun.CryptoHasher('sha256').update(s).digest('hex');
    return {owner,name:hash(JSON.stringify(['ssh-provider-v1',opts.instance,opts.provider,opts.account])),fingerprint:hash(JSON.stringify([owner,item.id,item.host,item.user,item.port,item.publicKey,item.pinnedHostKey,opts.provider,opts.account]))};
}
