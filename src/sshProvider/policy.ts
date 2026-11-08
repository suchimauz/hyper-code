/**
 * Validate provider-specific SSH SOCKS HTTPS routes and request headers
 *
 * Pure policy for all SSH subscription providers, including OAuth refresh, inference, catalogues and quotas. Rejects unsafe URL encodings, redirects, methods and cross-provider destinations before networking.
 * @param opts.provider Exact supported subscription provider identity.
 * @param opts.url Absolute HTTPS endpoint to validate.
 * @param opts.method Explicit GET or POST method.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact supported subscription provider identity. */
        provider: string;
        /** Absolute HTTPS endpoint to validate. */
        url: string;
        /** Explicit GET or POST method. */
        method: string;
    },
): URL {
    const u=new URL(opts.url),p=opts.provider,path=u.pathname;
    if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||opts.url.includes('#')||/%|\\/.test(path)||opts.url.includes('..')||!['GET','POST'].includes(opts.method))throw Error('Provider endpoint denied');
    const fixed:Record<string,Record<string,string>>={
    'codex':{'chatgpt.com/backend-api/codex/responses':'POST','chatgpt.com/backend-api/codex/responses/compact':'POST','chatgpt.com/backend-api/codex/models':'GET','chatgpt.com/backend-api/wham/usage':'GET','auth.openai.com/oauth/token':'POST'},
    'claude-code':{'api.anthropic.com/v1/messages':'POST','api.anthropic.com/v1/messages/count_tokens':'POST','api.anthropic.com/api/oauth/usage':'GET','console.anthropic.com/v1/oauth/token':'POST'},
    'kimi-coding':{'api.kimi.com/coding/v1/messages':'POST','api.kimi.com/coding/v1/models':'GET','api.kimi.com/coding/v1/usages':'GET','api.kimi.com/coding/v1/me':'GET','auth.kimi.com/api/oauth/token':'POST'},
    'zai-coding':{'api.z.ai/api/coding/paas/v4/chat/completions':'POST','api.z.ai/api/coding/paas/v4/models':'GET','api.z.ai/api/monitor/usage/quota/limit':'GET'},
    'minimax-coding':{'api.minimax.io/anthropic/v1/messages':'POST','api.minimax.io/anthropic/v1/messages/count_tokens':'POST','api.minimax.io/anthropic/v1/models':'GET','www.minimax.io/v1/token_plan/remains':'GET'}};
    if(p!=='opencode'){if(fixed[p]?.[u.hostname+path]!==opts.method)throw Error('Provider endpoint denied');return u;}
    if(u.hostname!=='opencode.ai')throw Error('Provider endpoint denied');
    const route=path.replace(/^\/inference\/go\//,'/inference/');
    const gemini=/^\/inference\/google\/v1beta\/models\/([A-Za-z0-9._-]+):(generateContent|streamGenerateContent)$/.exec(route);
    const get=['/v2/docs/console/go','/v2/docs/console/models','/inference/v1/models','/console/api/v1/budgets/members','/inference/go/v1/usage'].includes(route)||path==='/inference/go/v1/usage';
    const post=['/inference/openai/v1/chat/completions','/inference/openai/v1/responses','/inference/anthropic/v1/messages'].includes(route)||!!gemini;
    if((get?'GET':post?'POST':'')!==opts.method)throw Error('Provider endpoint denied');
    if(gemini?.[2]==='streamGenerateContent'){if(u.search!=='?alt=sse')throw Error('Stream query denied');}else if(u.search||opts.url.includes('?'))throw Error('Provider query denied');
    return u;
}
