/**
 * Builds a pinned persistent OpenSSH invocation for a trusted instance
 *
 * Use with Bun.spawn([bin,...args,host,remoteCommand]); building options never contacts the host. Refuses instances without an explicitly confirmed host key.
 * @param opts.name Exact configured SSH instance name.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact configured SSH instance name. */
        name: string;
    },
): Promise<{bin:string;args:string[];host:string}> {
    await ctx.fns.sshInstance.authorize({});
    const item=await ctx.fns.sshInstance.get({name:opts.name}); await ctx.fns.sshInstance.validate(item);
    if (!item.pinnedHostKey) throw new Error('Confirm the host key out of band before connecting');
    const p=await ctx.fns.sshInstance.paths({id:item.id});
    const fs=await import('node:fs/promises'); for(const file of [p.key,p.knownHosts]){const s=await fs.lstat(file); if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077))throw new Error('Unsafe SSH file permissions');}
    const args=['-F','/dev/null','-T','-p',String(item.port),'-l',item.user,'-i',p.key,'-o','IdentitiesOnly=yes','-o','IdentityAgent=none','-o','BatchMode=yes','-o','PasswordAuthentication=no','-o','KbdInteractiveAuthentication=no','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+p.knownHosts,'-o','GlobalKnownHostsFile=/dev/null','-o','UpdateHostKeys=no','-o','ControlMaster=auto','-o','ControlPersist=600','-o','ControlPath='+p.socket,'-o','ConnectTimeout=10','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3','--'];
    return {bin:'ssh',args,host:item.host};
}
