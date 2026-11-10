/**
 * Probe and import an explicitly selected confirmed unused slot into encrypted local SOCKS routing
 *
 * Explicit owner-authorized scoped migration. Refuses expired tokens without refresh, probes authentication before any encrypted save, and never returns credential material. Does not grant global cold authority.
 * @param opts.instance Configured SSH instance name.
 * @param opts.account Isolated Codex account slot to import.
 * @param opts.confirmedUnused Explicit user confirmation that this exact slot has no pre-existing active streams.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Configured SSH instance name. */
        instance: string;
        /** Isolated Codex account slot to import. */
        account: string;
        /** Explicit user confirmation that this exact slot has no pre-existing active streams. */
        confirmedUnused: true;
    },
): Promise<{ok:true;instance:string;account:string;mode:string}> {
    if (!session?.user?.id || session.user.role !== 'owner') throw Error('Authenticated owner required for import');
    await ctx.fns.sshAccount.requireOwner({});
    if (typeof opts.instance !== 'string' || typeof opts.account !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(opts.instance) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(opts.account)) throw Error('Invalid Codex account');
    if(opts.confirmedUnused!==true)throw Error('Explicit unused-slot confirmation required');
    const service=await (ctx as any).fns.codexTunnel.scopedService({instance:opts.instance,account:opts.account});
    return service.exclusive(async()=>{
    const b=await ctx.fns.codexAccount.binding({instance:opts.instance,account:opts.account});const store=ctx.fns.codexTunnel.encryptedStore({name:b.name});const row=await store.read();if(row&&row.value.mode!=='legacy')throw Error('Already migrated or recovery required');
    await (ctx as any).fns.codexTunnel.readSelected({instance:opts.instance,account:opts.account,consume:async(tokens:{access:string;refresh:string;accountId:string;expires:number})=>{
    ctx.fns.codexTunnel.identity({t:tokens});if(tokens.expires<=Date.now()+120000)throw Error('Import refused: access token expired or expires within 120 seconds; no refresh attempted');
    const tunnel=await ctx.fns.codexTunnel.openProduction({instance:opts.instance});
    try{const response=await ctx.fns.codexSocksIsolated.request({url:'https://chatgpt.com/backend-api/wham/usage',method:'GET',proxyPort:tunnel.port,signal:tunnel.signal,headers:{authorization:'Bearer '+tokens.access,'chatgpt-account-id':tokens.accountId},timeoutMs:15000});const ok=response.ok;await response.body?.cancel();if(!ok)throw Error('Authenticated import probe rejected');}catch{throw Error('Authenticated import probe failed; no credentials saved')}finally{await tunnel.close()}
    await service.runtime.migrate({instance:opts.instance,account:opts.account,provider:'codex'},tokens);
    }});
    return {ok:true,instance:opts.instance,account:opts.account,mode:'socks'};
    });
}
