/**
 * Resolves protected local storage for one SSH identity
 *
 * Internal filesystem helper for SSH key generation and transport; never reads or returns private key contents.
 * @param opts.id Generated UUID storage identifier.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Generated UUID storage identifier. */
        id: string;
    },
): Promise<{dir:string;key:string;knownHosts:string;socket:string}> {
    await ctx.fns.sshInstance.authorize({});
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(opts.id)) throw new Error('Invalid identity id');
    const fs = await import('node:fs/promises'); const {homedir} = await import('node:os'); const {join} = await import('node:path');
    const base = join(homedir(),'.hyper','ssh-instances');
    await fs.mkdir(base,{recursive:true,mode:0o700});
    for (const dir of [base,join(base,opts.id)]) { await fs.mkdir(dir,{recursive:true,mode:0o700}); const s=await fs.lstat(dir); if (!s.isDirectory() || s.isSymbolicLink()) throw new Error('Unsafe SSH storage'); await fs.chmod(dir,0o700); }
    if (Buffer.byteLength(join(base,opts.id,'cm')) > 100) throw new Error('SSH identity path too long for a safe persistent socket');
    const dir=join(base,opts.id); return {dir,key:join(dir,'identity'),knownHosts:join(dir,'known_hosts'),socket:join(dir,'cm')};
}
