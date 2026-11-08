/**
 * Explicitly activate or suspend an owner-bound provider SSH SOCKS account
 *
 * Guarded account-scoped activation after pre-gate requests drain. Imports OAuth tokens privately without provider calls; caller-token plans need no credential import. Suspend preserves all encrypted rotated credentials and fails closed rather than switching to stale remote credentials. Never changes model settings.
 * @param opts.instance Exact pinned SSH instance.
 * @param opts.provider Supported provider to activate.
 * @param opts.account Exact isolated provider account.
 * @param opts.action Explicit lifecycle action; suspension retains credentials.
 * @param opts.confirmed True only after the owner explicitly authorizes this exact action.
 * @param opts.drained Owner confirms requests begun before this dispatcher was installed have completed.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact pinned SSH instance. */
        instance: string;
        /** Supported provider to activate. */
        provider: string;
        /** Exact isolated provider account. */
        account: string;
        /** Explicit lifecycle action; suspension retains credentials. */
        action: 'activate'|'suspend'|'resume';
        /** True only after the owner explicitly authorizes this exact action. */
        confirmed: boolean;
        /** Owner confirms requests begun before this dispatcher was installed have completed. */
        drained: boolean;
    },
): Promise<{instance:string;provider:string;account:string;mode:string}> {
    if(opts.confirmed!==true||opts.drained!==true)throw Error('Explicit owner approval and pre-gate drain required');const d={instance:opts.instance,provider:opts.provider,account:opts.account},b=await ctx.fns.sshProvider.binding(d);const release=await ctx.fns.sshProvider.lease({key:b.name});try{
    const flows=(ctx.state as any).sshAccount?.flows as Map<string,{instance:string;account:string;status:string}>|undefined;if([...flows?.values()??[]].some(f=>f.instance===d.instance&&f.account===d.account&&f.status==='pending'))throw Error('Pending CLI login blocks activation');
    const store=ctx.fns.codexTunnel.encryptedStore({name:b.name}),row=await store.read();if(row&&(row.value.owner!==b.owner||row.value.binding!==b.fingerprint||row.value.provider!==d.provider))throw Error('Account binding changed');
    if(opts.action!=='activate'){if(!row||!['socks','suspended'].includes(row.value.mode))throw Error('Account unavailable or requires recovery');const mode=opts.action==='suspend'?'suspended':'socks';await store.save(row.revision,{...row.value,mode});return {...d,mode};}
    if(row)throw Error('Already imported; resume or recover existing encrypted credentials');
    // Transfer an already migrated Codex record, never reimport stale remote refresh tokens.
    if(d.provider==='codex'){const oldBinding=await ctx.fns.codexAccount.binding({instance:d.instance,account:d.account});const oldStore=ctx.fns.codexTunnel.encryptedStore({name:oldBinding.name});const old=await oldStore.read();if(old&&old.value.mode!=='legacy'){if(old.value.mode!=='socks'||old.value.owner!==b.owner||old.value.binding!==oldBinding.fingerprint)throw Error('Existing Codex record requires recovery');await store.save(null,{...old.value,version:1,mode:'socks',owner:b.owner,binding:b.fingerprint,provider:d.provider});return {...d,mode:'socks'};}}
    const save=async(tokens?:{access:string;refresh:string;expires:number;accountId?:string})=>{await store.save(null,{version:1,mode:'socks',owner:b.owner,binding:b.fingerprint,provider:d.provider,tokens})};
    if(['codex','claude-code','kimi-coding'].includes(d.provider)){const rows=await ctx.fns.sshAccount.registry({action:'list'});if(!rows.some(r=>r.instance===d.instance&&r.provider===d.provider&&r.account===d.account&&r.status==='connected'))throw Error('Connected OAuth account required');await ctx.fns.sshProvider.readCredentials({...d,consume:save});}else await save();
    return {...d,mode:'socks'};
    }finally{release()}
}
