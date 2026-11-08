/**
 * Reserve a port, launch a dedicated SSH child and wait for socket ownership with bounded cleanup.
 *
 * Reserve a port, launch a dedicated SSH child and wait for socket ownership with bounded cleanup.
Staged candidate; use only from cold-bootstrapped owner runtime, never direct hot activation.
 * @param opts.connection Explicit connection input for this account operation.
 * @param opts.deps deps required by openOwned; supplied by owner-controlled caller.
 * @param opts.signal signal required by openOwned; supplied by owner-controlled caller.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit connection input for this account operation. */
        connection: {bin:string;args:string[];host:string};
        /** deps required by openOwned; supplied by owner-controlled caller. */
        deps: {reserve:()=>Promise<{port:number;release:()=>Promise<void>}>;spawn:(args:string[])=>{pid:number;kill:(s:any)=>any;exited:Promise<any>};owns:(pid:number,port:number)=>Promise<boolean>;sleep:(ms:number)=>Promise<void>};
        /** signal required by openOwned; supplied by owner-controlled caller. */
        signal?: AbortSignal;
    },
): Promise<{ port: number; signal: AbortSignal; close: () => Promise<void>; }> {
    const connection=opts.connection;
    const deps=opts.deps;
    const signal=opts.signal;
    
     const reservation=await deps.reserve();let child:ReturnType<typeof deps.spawn>|undefined;let stop:Promise<void>|undefined;const abort=new AbortController();const close=()=>stop??=child?(ctx as any).fns.codexTunnel.boundedStop({p: child}):Promise.resolve();let exited=false;
     try{signal?.throwIfAborted();await reservation.release();child=deps.spawn((ctx as any).fns.codexTunnel.sshArgs({connection: connection,port: reservation.port}));void child.exited.then(()=>{exited=true;abort.abort()},()=>{exited=true;abort.abort()});const cancel=()=>{abort.abort();void close().catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});const deadline=Date.now()+3000;try{while(!exited){signal?.throwIfAborted();if(await deps.owns(child.pid,reservation.port)){if(exited)throw Error('SSH exited');return {port:reservation.port,signal:abort.signal,close:async()=>{signal?.removeEventListener('abort',cancel);await close()}}}if(Date.now()>=deadline)throw Error('SSH readiness timeout');await deps.sleep(20)}throw Error('SSH exited before readiness')}catch(e){signal?.removeEventListener('abort',cancel);throw e}
     }catch(e){await close();throw e}finally{await reservation.release()}
}
