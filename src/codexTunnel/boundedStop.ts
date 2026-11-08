/**
 * Terminate and reap a tunnel child within TERM/KILL deadlines; fail closed if death cannot be confirmed.
 *
 * Terminate and reap a tunnel child within TERM/KILL deadlines; fail closed if death cannot be confirmed.
Staged candidate; use only from cold-bootstrapped owner runtime, never direct hot activation.
 * @param opts.p Explicit p input for this account operation.
 * @param opts.ms ms required by boundedStop; supplied by owner-controlled caller.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit p input for this account operation. */
        p: {kill:(s:any)=>any;exited:Promise<any>};
        /** ms required by boundedStop; supplied by owner-controlled caller. */
        ms?: any;
    },
): Promise<void> {
    const p=opts.p;
    const ms=opts.ms??500;
    const wait=async()=>{let timer:ReturnType<typeof setTimeout>;const done=await Promise.race([p.exited.then(()=>true),new Promise<false>(r=>{timer=setTimeout(()=>r(false),ms)})]);clearTimeout(timer!);return done};p.kill('SIGTERM');if(await wait())return;p.kill('SIGKILL');if(!await wait())throw Error('SSH termination unconfirmed');
}
