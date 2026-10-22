/**
 * Send OpenCode inference and discovery requests over the selected billing route.
 *
 * Enforce exact documented endpoints, reject redirects, and keep Go subscription
 * traffic separate from pay-as-you-go. Credentials travel only to opencode.ai,
 * locally or through a pinned SSH bridge. Never impersonates an official client.
 * @param opts.url Exact documented inference, catalogue or read-only member-budget URL.
 * @param opts.init HTTP method, JSON payload and cancellation signal.
 * @param opts.sessionId Stable conversation identifier; forwarded as x-opencode-session. Omit for a standalone request.
 */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Exact documented inference, catalogue or read-only member-budget URL. */
    url: string;
    /** HTTP method, JSON payload and cancellation signal. */
    init: RequestInit;
    /** Stable conversation identifier; omit for a standalone request. */
    sessionId?: string;
}): Promise<Response> {
    const url = new URL(opts.url);
    const method = (opts.init.method ?? 'GET').toUpperCase();
    const plan = await ctx.fns.settings.getString({module:'llm',scopeType:'global',key:'opencodePlan'}) === 'go' ? 'go' : 'payg';
    const isGo = url.pathname.startsWith('/inference/go/');
    const path = isGo ? url.pathname.replace('/inference/go/', '/inference/') : url.pathname;
    const read = ['/inference/v1/models','/console/api/v1/budgets/members'].includes(path);
    const post = ['/inference/openai/v1/chat/completions','/inference/openai/v1/responses','/inference/anthropic/v1/messages'].includes(path);
    const gemini = /^\/inference\/google\/v1beta\/models\/([A-Za-z0-9][A-Za-z0-9._-]{0,127}):(generateContent|streamGenerateContent)$/.exec(path);
    const queryOk = !url.search || (gemini?.[2] === 'streamGenerateContent' && url.search === '?alt=sse');
    if (url.origin !== 'https://opencode.ai' || url.username || url.password || url.hash || !queryOk || !(read || post || gemini) || gemini?.[1]?.includes('..') || method !== (read ? 'GET' : 'POST')) throw new Error('Unsupported OpenCode endpoint');
    if (url.pathname.startsWith('/inference/') && isGo !== (plan === 'go')) throw new Error('OpenCode billing route does not match the selected plan');
    if (plan === 'go' && path === '/console/api/v1/budgets/members') throw new Error('Member budgets are not Go subscription usage');
    const key = await ctx.fns.secrets.resolveSetting({module:'llm',scopeType:'global',key:'opencodeApiKey'});
    // Public catalogue is documented without authentication. Paid inference and Go require a key.
    let publicChat = false;
    if (!key && !isGo && path === '/inference/openai/v1/chat/completions' && typeof opts.init.body === 'string') {
        try {
            const model = (JSON.parse(opts.init.body) as {model?:string}).model;
            const catalog = await ctx.fns.llm.opencodeCatalog({cachedOnly:true});
            publicChat = catalog.models.some(entry => entry.id === model && entry.public && entry.api === 'openai');
        } catch { throw new Error('Invalid public OpenCode chat request'); }
    }
    if (!key && (isGo || (path !== '/inference/v1/models' && !publicChat))) throw new Error('OpenCode key is not configured');
    const headers = new Headers(opts.init.headers);
    headers.delete('authorization');
    if (key) headers.set('authorization','Bearer '+key);
    headers.set('user-agent','Hyper/OpenCode');
    const sid = opts.sessionId ?? headers.get('x-opencode-session') ?? Bun.randomUUIDv7();
    if (!sid || sid.length > 256 || /[\r\n]/.test(sid)) throw new Error('Invalid OpenCode session identifier');
    headers.set('x-opencode-session', sid);
    if (method === 'POST') headers.set('content-type','application/json');
    const raw = await ctx.fns.settings.getString({module:'llm',scopeType:'global',key:'opencodeInstance'});
    const instance = raw?.trim();
    const init = {...opts.init,method,headers,redirect:'error' as const,signal:opts.init.signal ?? AbortSignal.timeout(60000)};
    if (instance && instance !== 'local') return ctx.fns.sshAccount.fetch({ssh:{instance,provider:'opencode',account:'default'},url:url.href,init:{method,headers:Object.fromEntries(headers.entries()),body:typeof init.body === 'string' ? init.body : undefined,signal:init.signal ?? undefined}});
    return ctx.fns.llm.connectFetch({url:url.href,init});
}
