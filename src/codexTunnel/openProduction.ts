/**
 * Adapt validated pinned SSH connection material to Linux tunnel process and socket ownership checks.
 *
 * Adapt validated pinned SSH connection material to Linux tunnel process and socket ownership checks.
Staged candidate; use only from cold-bootstrapped owner runtime, never direct hot activation.
 * @param opts.instance Explicit instance input for this account operation.
 * @param opts.signal signal required by openProduction; supplied by owner-controlled caller.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit instance input for this account operation. */
        instance: string;
        /** signal required by openProduction; supplied by owner-controlled caller. */
        signal?: AbortSignal;
    },
): Promise<any> {
    const instance=opts.instance;
    const signal=opts.signal;
    
     if(process.platform!=='linux')throw Error('Listener ownership proof requires Linux');
     const fs=await import('node:fs/promises'),net=await import('node:net');
     // Existing builder checks owner, pin, endpoint and 0600 non-symlink material.
     const connection=await (ctx as any).fns.sshInstance.connection({name:instance});
     return (ctx as any).fns.codexTunnel.openOwned({connection: connection,deps: {reserve:()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=(server.address() as import('node:net').AddressInfo).port;let closing:Promise<void>|undefined;resolve({port,release:()=>closing??=new Promise<void>((r,j)=>server.close(e=>e?j(e):r()))})})}),spawn:(args:string[])=>Bun.spawn(args,{stdin:'ignore',stdout:'ignore',stderr:'ignore'}),owns:(pid:number,port:number)=>(ctx as any).fns.codexTunnel.ownsListener({pid,port,io:fs}),sleep:(ms:number)=>Bun.sleep(ms)},signal: signal});
}
