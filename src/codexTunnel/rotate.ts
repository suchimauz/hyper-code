/**
 * Persist recovery before refreshing and retain a newly rotated token for CAS retry without another refresh.
 *
 * Persist recovery before refreshing and retain a newly rotated token for CAS retry without another refresh.
Staged candidate; use only from cold-bootstrapped owner runtime, never direct hot activation.
 * @param opts.store Explicit store input for this account operation.
 * @param opts.row row required by rotate; supplied by owner-controlled caller.
 * @param opts.refresh refresh required by rotate; supplied by owner-controlled caller.
 * @param opts.pending pending required by rotate; supplied by owner-controlled caller.
 * @param opts.slot slot required by rotate; supplied by owner-controlled caller.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit store input for this account operation. */
        store: {save:(r:number|null,v:any)=>Promise<number>};
        /** row required by rotate; supplied by owner-controlled caller. */
        row: {revision:number;value:any};
        /** refresh required by rotate; supplied by owner-controlled caller. */
        refresh: ()=>Promise<any>;
        /** pending required by rotate; supplied by owner-controlled caller. */
        pending: Map<string,any>;
        /** slot required by rotate; supplied by owner-controlled caller. */
        slot: string;
    },
): Promise<any> {
    const store=opts.store;
    const row=opts.row;
    const refresh=opts.refresh;
    const pending=opts.pending;
    const slot=opts.slot;
    
     const recovery={...row.value,mode:'recovery',reason:'refresh-in-flight'};const revision=await store.save(row.revision,recovery);let tokens;
     try{tokens=await refresh();(ctx as any).fns.codexTunnel.identity({t: tokens});if(tokens.accountId!==row.value.tokens.accountId||!tokens.refresh)throw Error('Rotation identity changed');pending.set(slot,{revision,tokens});await store.save(revision,{...row.value,mode:'socks',tokens,rotated:true});pending.delete(slot);return tokens}catch{throw Error('Credential recovery required; legacy rollback prohibited')}
}
