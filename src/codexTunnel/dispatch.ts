/**
 * Route Codex only after coordinated cold activation; keep default path unchanged.
 *
 * Route Codex only after coordinated cold activation; keep default path unchanged.
 * @param opts.request Explicit request input for this account operation.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit request input for this account operation. */
        request: {ssh:{instance:string;provider:string;account:string};url:string;init:object};
    },
): Promise<any> {
    if(opts.request.ssh.provider==='codex'&&opts.request.ssh.instance==='aeza-criminal-amarant'&&opts.request.ssh.account==='test'){
      // Serialize the selected legacy path too: import must exclude requests arriving during its probe.
      // runtime reads persisted mode under this same lease; missing/legacy records still use legacyFetch.
      return (await (ctx as any).fns.codexTunnel.scopedService({instance:opts.request.ssh.instance,account:opts.request.ssh.account})).runtime.fetch(opts.request);
     }
    if(!(ctx as any).state.codexTunnelAuthority&&opts.request.ssh.provider==='codex'){
      // Exact stable slot; never decrypt or inspect unrelated account credentials.
      const name=new Bun.CryptoHasher('sha256').update(JSON.stringify([opts.request.ssh.instance,opts.request.ssh.account])).digest('hex');
      const store=(ctx as any).fns.codexTunnel.encryptedStore({name});
      const row=await store.read();
      if(row){
       const b=await (ctx as any).fns.codexAccount.binding({instance:opts.request.ssh.instance,account:opts.request.ssh.account});
       if(!b.owner||b.owner!==String(session?.user?.id??'')||row.value.owner!==b.owner||row.value.binding!==b.fingerprint||row.value.version!==1||row.value.mode!=='legacy')throw Error('Account migration requires owner-confirmed cold authority or explicit recovery');
      }
     }
     if(!(ctx as any).state.codexTunnelAuthority||opts.request.ssh.provider!=='codex')return (ctx as any).fns.sshAccount.legacyFetch(opts.request);
     return (ctx as any).fns.codexTunnel.service({}).fetch(opts.request);
}
