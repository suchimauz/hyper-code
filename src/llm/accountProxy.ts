/**
 * Resolve the saved SOCKS5 binding for one local OAuth account without exposing secrets
 *
 * Use before local Claude network requests and reconnection. A missing binding returns null; storage errors fail closed and must never authorize direct traffic.
 * @param opts.provider Exact runtime provider identity.
 * @param opts.account Credential slot within the provider.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact runtime provider identity. */
        provider: string;
        /** Credential slot within the provider. */
        account: string;
    },
): Promise<{id:string;name:string|null;host:string;port:number}|null> {
    try {
     const rows = await ctx.fns.procs.db.select({sql:'SELECT p.id,p.name,p.host,p.port FROM llm_account_proxies b JOIN socks_proxies p ON p.id=b.proxy_id WHERE b.provider=? AND b.account=?',params:[opts.provider,opts.account]});
     return rows[0] ?? null;
    } catch { throw Object.assign(new Error('PROXY_CONFIG: cannot read account routing; direct access is forbidden'),{code:'PROXY_CONFIG',retryable:false,noFallback:true,requestSent:false}); }
}
