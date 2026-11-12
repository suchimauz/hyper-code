/**
 * Send local Claude account traffic through its immutable saved SOCKS5 route
 *
 * Use for inference, compaction, OAuth and usage. Resolves account binding before networking, forbids direct fallback when bound, validates server-configured Claude endpoints and preserves safe structured transport failures.
 * @param opts.account Local managed Claude OAuth credential slot.
 * @param opts.url Server-selected Claude HTTPS endpoint.
 * @param opts.init Method, headers, string body and cancellation signal.
 * @param opts.proxyId Pending OAuth selection before the account exists; cannot replace a saved binding.
 * @param opts.ms Header deadline in milliseconds. @minimum 1 @maximum 600000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Local managed Claude OAuth credential slot. */
        account: string;
        /** Server-selected Claude HTTPS endpoint. */
        url: string;
        /** Method, headers, string body and cancellation signal. */
        init: RequestInit;
        /** Pending OAuth selection before the account exists; cannot replace a saved binding. */
        proxyId?: string | null;
        /** Fail if a request previously resolved as proxy-bound loses its binding. */ requireProxy?: boolean;
        /** Header deadline in milliseconds. @minimum 1 @maximum 600000 */
        ms?: number;
    },
): Promise<Response> {
    const binding = await ctx.fns.llm.accountProxy({provider:'anthropic-oauth',account:opts.account});
    if (binding && opts.proxyId !== undefined && opts.proxyId !== binding.id) throw Object.assign(new Error('PROXY_CONFIG: account proxy cannot be changed'),{code:'PROXY_CONFIG',retryable:false,noFallback:true,requestSent:false});
    const id = binding?.id ?? opts.proxyId;
    if(opts.requireProxy && !id)throw Object.assign(new Error("PROXY_CONFIG: required proxy binding is missing"),{code:"PROXY_CONFIG",retryable:false,noFallback:true,requestSent:false});
    if(opts.proxyId===undefined && !(await ctx.fns.procs.db.select({sql:"SELECT account FROM oauth_credentials WHERE provider=? AND account=?",params:["anthropic-oauth",opts.account]})).length)throw Object.assign(new Error("PROXY_CONFIG: account no longer exists; direct access is forbidden"),{code:"PROXY_CONFIG",retryable:false,noFallback:true,requestSent:false});
    if (!id) return ctx.fns.llm.connectFetch({url:opts.url,init:opts.init,ms:opts.ms});
    try {
     const base = String(ctx.env.CLAUDE_CODE_BASE_API_URL ?? 'https://api.anthropic.com').replace(/\/$/,'');
     const token = ctx.fns.llm.anthropicOAuthConstants({}).tokenUrl;
     const method = opts.init.method ?? 'GET';
     const destinations:Record<string,string> = {[base+'/v1/messages']:'POST',[base+'/v1/messages/count_tokens']:'POST',[base+'/api/oauth/usage']:'GET',[base+'/api/oauth/profile']:'GET',[token]:'POST'};
     if (destinations[opts.url] !== method || new URL(opts.url).protocol !== 'https:') throw Object.assign(new Error('PROXY_CONFIG: Claude endpoint is not allowed'),{code:'PROXY_CONFIG',retryable:false,requestSent:false});
     const proxy = await ctx.fns.socksProxy.readSaved({id});
     const headers=Object.fromEntries(new Headers(opts.init.headers).entries());
     return await ctx.fns.socksProxy.request({proxy,url:opts.url,method:method as 'GET'|'POST',headers,body:opts.init.body == null ? undefined : new TextEncoder().encode(String(opts.init.body)),signal:opts.init.signal ?? undefined,timeoutMs:1800000,headerTimeoutMs:opts.ms ?? 120000,idleTimeoutMs:90000});
    } catch (error) {
     if (error instanceof Error && error.name==='AbortError') throw error;
     const e=error as Error & {code?:string;retryable?:boolean;requestSent?:boolean};
     const known=typeof e.code==='string' && e.code.startsWith('PROXY_');
     const code=known?e.code!:'PROXY_CONFIG';
     const message=known?(e.message.startsWith(code)?e.message:`${code}: ${e.message}`):'PROXY_CONFIG: saved proxy or credentials unavailable; direct access is forbidden';
     throw Object.assign(new Error(message),{code,noFallback:true,retryable:known && e.retryable===true,requestSent:e.requestSent??false,failure:{kind:known&&e.retryable?'transient':'fatal',code,provider:'anthropic-oauth',account:opts.account,retryable:known&&e.retryable===true,message}});
    }
}
