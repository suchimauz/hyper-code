/**
 * Resolve owner-bound tunnel service after explicit cold bootstrap.
 *
 * Resolve owner-bound tunnel service after explicit cold bootstrap.
Never infer a drained worker from an empty counter or missing runtime state.
Authority must be injected by a separately authorized cold-start supervisor.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {},
): any {
    const a=(ctx as any).state.codexTunnelAuthority;
     if(!a||a.coldBoundaryConfirmed!==true||a.owner!==String(session?.user?.id??'')||typeof a.protectedSlot!=='string'||!a.protectedSlot||typeof a.lockDirectory!=='string')throw Error('Operator-confirmed safe cold-start boundary and protected current account required');
     const st=(ctx as any).state.codexSocksCandidate??={tails:new Map(),pending:new Map(),cold:false};
     if(st.authority&&(st.authority!==a||st.protectedSlot!==a.protectedSlot||st.lockDirectory!==a.lockDirectory||st.owner!==a.owner))throw Error('Authority replacement prohibited');st.authority=a;st.protectedSlot=a.protectedSlot;st.lockDirectory=a.lockDirectory;st.owner=a.owner;
     st.cold=true;
     return (ctx as any).fns.codexTunnel.runtime({options:{protectedSlot:a.protectedSlot,claim:()=>(ctx as any).fns.codexTunnel.claim({directory:a.lockDirectory}),legacy:(o:any)=>(ctx as any).fns.sshAccount.legacyFetch(o)}});
}
