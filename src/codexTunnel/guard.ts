/**
 * Guard guard operations for explicit Codex migration
 *
 * Guard account mutations when persisted migration records require cold owner authority.
 * @param opts.operation Explicit operation input for this account operation.
 * @param opts.provider Explicit provider input for this account operation.
 * @param opts.action Explicit action input for this account operation.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit operation input for this account operation. */
        operation: 'login'|'registry'|'descriptor';
        /** Explicit provider input for this account operation. */
        provider?: string;
        /** Explicit action input for this account operation. */
        action?: string;
        /** Exact SSH instance affected by the mutation. */
        instance?: string;
        /** Exact isolated account affected by the mutation. */
        account?: string;
    },
): Promise<void> {
    if(opts.operation==='registry'&&opts.action==='list')return;
    if(!opts.instance)throw Error('Exact SSH instance required for mutation');
    await ctx.fns.sshAccount.requireOwner({});
    const hash=(parts:string[])=>new Bun.CryptoHasher('sha256').update(JSON.stringify(parts)).digest('hex');
    const slots=opts.operation==='descriptor'
        ? await ctx.fns.sshAccount.registry({action:'list',instance:opts.instance})
        : [{instance:opts.instance,provider:opts.provider??'',account:opts.account??''}];
    for(const slot of slots){
        const names=[hash(['ssh-provider-v1',slot.instance,slot.provider,slot.account])];
        if(slot.provider==='codex')names.push(hash([slot.instance,slot.account]));
        for(const name of names){
            const row=await ctx.fns.codexTunnel.encryptedStore({name}).read();
            if(row&&(row.value.version!==1||row.value.mode!=='legacy'))throw Error('Migrated credentials require explicit recovery before SSH mutation');
        }
    }
}
