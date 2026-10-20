/**
 * Registers an SSH endpoint and generates its private Ed25519 identity locally
 *
 * Use for explicit owner onboarding. Generates a 0600 private key outside the repository, returns only its public key, and performs no SSH login or network request.
 * @param opts.name Unique stable instance name.
 * @param opts.host Literal DNS hostname or IP address, not an SSH config alias.
 * @param opts.user Remote Unix login account.
 * @param opts.port SSH TCP port. @default 22 @minimum 1 @maximum 65535
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Unique stable instance name. */
        name: string;
        /** Literal DNS hostname or IP address, not an SSH config alias. */
        host: string;
        /** Remote Unix login account. */
        user: string;
        /** SSH TCP port. @default 22 @minimum 1 @maximum 65535 */
        port?: number;
    },
): Promise<types.sshInstance.Instance> {
    await ctx.fns.sshInstance.authorize({});
    const endpoint=await ctx.fns.sshInstance.validate(opts);
    if((await ctx.fns.sshInstance.list({})).some(r=>r.name===endpoint.name)) throw new Error('Instance name already exists');
    const id=crypto.randomUUID(); const p=await ctx.fns.sshInstance.paths({id});
    const child=Bun.spawn(['ssh-keygen','-q','-t','ed25519','-N','','-C','hyper:'+endpoint.name,'-f',p.key],{stdout:'pipe',stderr:'pipe'});
    if(await child.exited!==0) throw new Error('Local Ed25519 key generation failed');
    const fs=await import('node:fs/promises'); await fs.chmod(p.key,0o600);
    const publicKey=(await fs.readFile(p.key+'.pub','utf8')).trim();
    const item={...endpoint,id,publicKey,pinnedHostKey:null,updatedAt:Date.now()};
    const rows=await ctx.fns.procs.db.select({sql:'INSERT INTO settings(module,scope_type,scope_id,key,value,is_secret,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(module,scope_type,scope_id,key) DO NOTHING RETURNING scope_id',params:['sshInstance','instance',item.name,'descriptor',JSON.stringify(item),0,item.updatedAt]});
    if(!rows.length){await fs.rm(p.dir,{recursive:true,force:true}); throw new Error('Instance name already exists');}
    return item;
}
