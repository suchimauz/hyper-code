/**
 * Read and compare-and-swap encrypted local_secrets records using authenticated namespace/name and monotonically increasing revisions.
 *
 * Read and compare-and-swap encrypted local_secrets records using authenticated namespace/name and monotonically increasing revisions.
Staged candidate; use only from cold-bootstrapped owner runtime, never direct hot activation.
 * @param opts.name Explicit name input for this account operation.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit name input for this account operation. */
        name: string;
    },
): { read(): Promise<{ revision: number; value: any; }>; save(revision: number | null, value: object): Promise<number>; } {
    const name=opts.name;
    
     const namespace='codex-socks-v1';
     return {async read(){const rows=await (ctx as any).fns.procs.db.select({sql:'SELECT value_enc,version FROM local_secrets WHERE namespace=? AND name=?',params:[namespace,name]});if(!rows.length)return null;return {revision:Number(rows[0].version),value:JSON.parse(await (ctx as any).fns.secrets.decryptLocal({namespace,name,envelope:String(rows[0].value_enc)}))}},
     async save(revision:number|null,value:object){const envelope=await (ctx as any).fns.secrets.encryptLocal({namespace,name,value:JSON.stringify(value)});const now=Date.now();const rows=revision===null?await (ctx as any).fns.procs.db.select({sql:'INSERT INTO local_secrets(namespace,name,value_enc,source,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?) ON CONFLICT(namespace,name) DO NOTHING RETURNING version',params:[namespace,name,envelope,'codex-socks',now,now]}):await (ctx as any).fns.procs.db.select({sql:'UPDATE local_secrets SET value_enc=?,source=?,version=version+1,updated_at=? WHERE namespace=? AND name=? AND version=? RETURNING version',params:[envelope,'codex-socks',now,namespace,name,revision]});if(rows.length!==1)throw Error('Credential CAS conflict');return Number(rows[0].version)}};
}
