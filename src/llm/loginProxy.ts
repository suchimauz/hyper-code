/**
 * Validate immutable Claude proxy selection before starting or completing OAuth
 *
 * Use at OAuth start and completion. Existing slots retain their saved route; proxy selection is allowed only for a new local OAuth slot.
 * @param opts.account Validated local Claude account slot.
 * @param opts.proxyId Selected saved proxy UUID; omitted preserves an existing binding.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Validated local Claude account slot. */
        account: string;
        /** Selected saved proxy UUID; omitted preserves an existing binding. */
        proxyId?: string | null;
    },
): Promise<string|null> {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/.test(opts.account) || opts.account.startsWith('ssh.')) throw new Error('Invalid local OAuth account');
    const binding = await ctx.fns.llm.accountProxy({provider:'anthropic-oauth',account:opts.account});
    const exists = (await ctx.fns.procs.db.select({sql:'SELECT account FROM oauth_credentials WHERE provider=? AND account=?',params:['anthropic-oauth',opts.account]})).length > 0;
    if (exists && opts.proxyId !== undefined && (opts.proxyId ?? null) !== (binding?.id ?? null)) throw new Error('Account proxy cannot be changed; remove and add the account again');
    const id = exists ? binding?.id ?? null : opts.proxyId ?? null;
    if (id) {await ctx.fns.socksProxy.validateIdentity({id});const found=await ctx.fns.procs.db.select({sql:'SELECT id FROM socks_proxies WHERE id=?',params:[id]});if(!found.length)throw Object.assign(new Error('PROXY_CONFIG: selected proxy no longer exists'),{code:'PROXY_CONFIG',retryable:false,noFallback:true,requestSent:false});}
    return id;
}
