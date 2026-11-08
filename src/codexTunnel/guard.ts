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
    const _session=session;
    
     if(opts.operation==='registry'&&opts.action==='list')return;
     if(opts.operation!=='descriptor'&&opts.provider!=='codex')return;
     const rows=await (ctx as any).fns.procs.db.select({sql:'SELECT name,value_enc FROM local_secrets WHERE namespace=?',params:['codex-socks-v1']});
     const selectedName=new Bun.CryptoHasher('sha256').update(JSON.stringify(['aeza-criminal-amarant','test'])).digest('hex');
     for(const row of rows){if(row.name===selectedName&&!(opts.instance==='aeza-criminal-amarant'&&(opts.operation==='descriptor'||opts.account==='test')))continue;let value;try{value=JSON.parse(await (ctx as any).fns.secrets.decryptLocal({namespace:'codex-socks-v1',name:String(row.name),envelope:String(row.value_enc)}))}catch{throw Error('Unreadable migration record; SSH mutation prohibited')}
     if(value.version!==1||value.mode!=='legacy')throw Error('Migrated Codex credentials require explicit recovery before SSH mutation');}
}
