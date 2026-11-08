/**
 * Persist retained rotated OAuth credentials without repeating provider refresh
 *
 * Explicit owner recovery after encrypted CAS save failure. Uses only exact owner/pin-bound RAM candidate at matching recovery revision. Missing candidates require fresh CLI authorization; never reuse remote stale refresh tokens.
 * @param opts.instance Pinned SSH instance.
 * @param opts.provider OAuth provider account.
 * @param opts.account Exact isolated account.
 * @param opts.confirmed Explicit owner confirmation of recovery.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Pinned SSH instance. */
        instance: string;
        /** OAuth provider account. */
        provider: string;
        /** Exact isolated account. */
        account: string;
        /** Explicit owner confirmation of recovery. */
        confirmed: boolean;
    },
): Promise<{mode:string}> {
    if(opts.confirmed!==true)throw Error('Owner confirmation required');const b=await ctx.fns.sshProvider.binding({instance:opts.instance,provider:opts.provider,account:opts.account});const release=await ctx.fns.sshProvider.lease({key:b.name});try{const store=ctx.fns.codexTunnel.encryptedStore({name:b.name}),row=await store.read(),key=JSON.stringify([b.owner,b.fingerprint]);const pending=(ctx.state as any).sshProviderRecovery as Map<string,{revision:number;value:object}>|undefined;const candidate=pending?.get(key);if(!row||row.value.owner!==b.owner||row.value.binding!==b.fingerprint||row.value.mode!=='recovery'||!candidate||candidate.revision!==row.revision)throw Error('No retained rotated credential; fresh authorization required');await store.save(row.revision,candidate.value);pending!.delete(key);return {mode:'socks'};}finally{release()}
}
