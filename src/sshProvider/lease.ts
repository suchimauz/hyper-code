/**
 * Serialize provider account requests and activation through response completion
 *
 * Reload-stable account lease with bounded queue cancellation. Held by request until EOF or cancellation and by credential import through encrypted save; prevents activation during a preexisting request.
 * @param opts.key Owner-bound encrypted account slot identity.
 * @param opts.signal Optional cancellation while queued.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Owner-bound encrypted account slot identity. */
        key: string;
        /** Optional cancellation while queued. */
        signal?: AbortSignal;
    },
): Promise<()=>void> {
    const state=ctx.state as typeof ctx.state & {sshProviderTails?:Map<string,Promise<void>>};const tails=state.sshProviderTails??=new Map();
    const previous=tails.get(opts.key)??Promise.resolve();let release!:()=>void;const held=new Promise<void>(r=>release=r);tails.set(opts.key,held);
    let done=false;const finish=()=>{if(done)return;done=true;if(tails.get(opts.key)===held)tails.delete(opts.key);release()};
    let abort=()=>{};try{await Promise.race([previous,new Promise<never>((_,reject)=>{abort=()=>reject(Error('Queued request aborted'));opts.signal?.addEventListener('abort',abort,{once:true});if(opts.signal?.aborted)abort()})]);}catch(e){void previous.then(finish);throw e}finally{opts.signal?.removeEventListener('abort',abort)}
    if(opts.signal?.aborted){finish();opts.signal.throwIfAborted()}return finish;
}
