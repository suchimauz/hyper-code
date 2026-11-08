/**
 * Remove an SSH registry account and atomically tombstone its local imported credentials
 *
 * Use only from the owner-confirmed registry removal flow. Drains the exact provider lease, refuses pending login or legacy account work, and erases local tokens while retaining a fail-closed tombstone. Remote CLI credentials are never touched. Tombstones require explicit recovery rather than stale reimport.
 * @param opts.instance Exact configured SSH instance.
 * @param opts.provider Registry OAuth provider: codex, claude-code or kimi-coding.
 * @param opts.account Exact isolated account slot.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact configured SSH instance. */
        instance: string;
        /** Registry OAuth provider: codex, claude-code or kimi-coding. */
        provider: string;
        /** Exact isolated account slot. */
        account: string;
    },
): Promise<void> {
    await ctx.fns.sshAccount.requireOwner({});
    if(!['codex','claude-code','kimi-coding'].includes(opts.provider))throw Error('Invalid registry provider');
    const b=await ctx.fns.sshProvider.binding(opts);
    const release=await ctx.fns.sshProvider.lease({key:b.name});
    const legacyReleases:Array<()=>void>=[];
    try {
     const flows=ctx.state.sshAccount?.flows;
     if([...flows?.values()??[]].some(f=>f.instance===opts.instance&&f.provider===opts.provider&&f.account===opts.account&&f.status==='pending'))throw Error('Account login busy; finish or cancel it before removal');
     const slot=JSON.stringify([opts.instance,opts.account]);
     const state=ctx.state as typeof ctx.state & {codexScopedStates?:Map<string,{tails:Map<string,Promise<void>>;pending:Map<string,unknown>}>;codexSocksCandidate?:{tails:Map<string,Promise<void>>;pending:Map<string,unknown>};sshProviderRecovery?:Map<string,unknown>};
     const legacyStates=[state.codexSocksCandidate,...state.codexScopedStates?.values()??[]].filter(Boolean);
     if(opts.provider==='codex'&&legacyStates.some(s=>s!.tails.has(slot)))throw Error('Account migration busy; retry after it finishes');
     // Reserve legacy account tails too: migration/recovery started during the transaction must wait.
     if(opts.provider==='codex')for(const s of legacyStates){let end!:()=>void;const held=new Promise<void>(r=>end=r);s!.tails.set(slot,held);legacyReleases.push(()=>{if(s!.tails.get(slot)===held)s!.tails.delete(slot);end()});}
     const bindings=[{name:b.name,fingerprint:b.fingerprint}];
     if(opts.provider==='codex')bindings.push(await ctx.fns.codexAccount.binding({instance:opts.instance,account:opts.account}));
     await ctx.fns.procs.db.transaction({fn:async()=>{
      for(const identity of bindings){
       const store=ctx.fns.codexTunnel.encryptedStore({name:identity.name});const row=await store.read();
       if(row&&(row.value.owner!==b.owner||row.value.binding!==identity.fingerprint))throw Error('Account binding changed; removal denied');
       await store.save(row?.revision??null,{version:1,mode:'removed',owner:b.owner,binding:identity.fingerprint,provider:opts.provider});
      }
      await ctx.fns.settings.remove({module:'sshAccount',scopeType:'global',key:[opts.instance,opts.provider,opts.account].join(':')});
     }});
     state.sshProviderRecovery?.delete(JSON.stringify([b.owner,b.fingerprint]));
     if(opts.provider==='codex')for(const s of legacyStates)s!.pending.delete(slot);
    } finally {for(const end of legacyReleases)end();release()}
}
