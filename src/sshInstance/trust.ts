/**
 * Pins an independently verified SSH host public key after explicit confirmation
 *
 * Use after comparing the host key with an independent trusted channel, never just ssh-keyscan. Replacement requires replace and confirmed. Trust changes rotate local storage and socket namespace, preserving the login key.
 * @param opts.name Configured instance name.
 * @param opts.hostKey Verified OpenSSH Ed25519 public host key.
 * @param opts.confirmed True only after explicit owner verification through an independent channel.
 * @param opts.replace Explicitly permit replacing an existing different host pin. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Configured instance name. */
        name: string;
        /** Verified OpenSSH Ed25519 public host key. */
        hostKey: string;
        /** True only after explicit owner verification through an independent channel. */
        confirmed: boolean;
        /** Explicitly permit replacing an existing different host pin. @default false */
        replace?: boolean;
    },
): Promise<types.sshInstance.Instance> {
    await ctx.fns.sshInstance.authorize({}); if(opts.confirmed!==true) throw new Error('Explicit independent host key confirmation required');
    const match=/^ssh-ed25519 ([A-Za-z0-9+/]+={0,2})(?: [^\r\n]*)?$/.exec(opts.hostKey.trim()); if(!match) throw new Error('Provide an Ed25519 OpenSSH host public key');
    const blob=Buffer.from(match[1]!, 'base64'); if(blob.length!==51||blob.readUInt32BE(0)!==11||blob.subarray(4,15).toString()!=='ssh-ed25519'||blob.readUInt32BE(15)!==32) throw new Error('Invalid Ed25519 host key');
    const normalized='ssh-ed25519 '+blob.toString('base64'); const item=await ctx.fns.sshInstance.get({name:opts.name});
    if(item.pinnedHostKey === normalized) return item;
    if(item.pinnedHostKey && opts.replace !== true) throw new Error('Explicit host key replacement confirmation required');
    return (await ctx.fns.sshInstance.replaceDescriptor({previous:item,next:{...item,pinnedHostKey:normalized}}))!;
}
