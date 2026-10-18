/**
 * Load durable encrypted VAPID signing keys.
 *
 * Internal key management serialized by PostgreSQL advisory lock. Do not log private keys.
 * @param opts.subject Public HTTPS origin for initialization or repair of legacy records missing a subject; omitted for delivery reads.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: { /** Public HTTPS origin for initialization or repair of legacy records missing a subject; omitted for delivery reads. */ subject?:string },
): Promise<{publicKey:string;privateKey:string;subject:string}> {
    const result=await ctx.fns.procs.db.transaction({fn:async()=>{
        await ctx.fns.procs.db.select({sql:'SELECT pg_advisory_xact_lock(182738291)'});
        const ref='secret://web-push/vapid';
        const stored=await ctx.fns.secrets.get({ref});
        const saved = stored ? JSON.parse(stored) : null;
        if (saved && (typeof saved.publicKey !== 'string' || typeof saved.privateKey !== 'string')) throw new Error('Invalid stored Web Push keys');
        // Early installations stored the keypair before the contact subject was added.
        // Repair metadata only; rotating the keys would invalidate device subscriptions.
        const subject = saved?.subject ?? opts.subject;
        if(!subject)throw new Error('Web Push requires HTTPS initialization');
        const url=new URL(subject);
        if(url.protocol!=='https:'||url.hostname==='localhost'||url.username||url.password)throw new Error('Web Push requires a public HTTPS origin');
        if (saved?.subject) return saved;
        const wp=await import('web-push');
        const pair={...(saved ?? wp.generateVAPIDKeys()),subject:url.origin};
        await ctx.fns.secrets.set({ref,value:JSON.stringify(pair),source:'generated'});
        return pair;
    }});
    return result as {publicKey:string;privateKey:string;subject:string};
}
