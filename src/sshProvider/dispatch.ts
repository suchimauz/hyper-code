/**
 * Route all SSH provider HTTP through shared pinned SOCKS HTTPS
 *
 * SOCKS-only dispatcher for inference, models and quotas. Holds owner-bound lease through body completion, serializes refresh and validates destinations. OAuth requires secure onboarding; caller-token providers default to SOCKS. Existing suspended or recovery records fail closed.
 * @param opts.ssh Exact pinned provider account identity.
 * @param opts.url Allowlisted HTTPS provider URL.
 * @param opts.init Request body, caller credentials and cancellation signal.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact pinned provider account identity. */
        ssh: {instance:string;provider:"codex"|"claude-code"|"kimi-coding"|"zai-coding"|"minimax-coding"|"opencode";account:string};
        /** Allowlisted HTTPS provider URL. */
        url: string;
        /** Request body, caller credentials and cancellation signal. */
        init: {method?:string;headers?:Record<string,string>;body?:string;signal?:AbortSignal};
    },
): Promise<Response> {
    const d={...opts.ssh},init={...opts.init,headers:{...opts.init.headers}},url=opts.url;
    // Derive owner execution only after exact live cron capability verification.
    if(session&&(ctx.state as any).cron?.inferenceServices?.has(session))return ctx.fns.sshProvider.cronDispatch({ssh:d,url,init});
    const b=await ctx.fns.sshProvider.binding(d),release=await ctx.fns.sshProvider.lease({key:b.name,signal:init.signal});let close:()=>Promise<void>=async()=>{},finished=false;const done=async()=>{if(finished)return;finished=true;try{await close()}finally{release()}};
    try{const store=ctx.fns.codexTunnel.encryptedStore({name:b.name}),row=await store.read();let response:Response;
    if(!row&&['codex','claude-code','kimi-coding'].includes(d.provider))throw Error('SSH OAuth account requires secure onboarding: explicitly activate/import this exact account before HTTP use; no fallback');
    if(row&&(row.value.owner!==b.owner||row.value.binding!==b.fingerprint||row.value.provider!==d.provider||row.value.mode!=='socks'))throw Error('Bound account unavailable; no fallback');
    const method=init.method??(init.body===undefined?'GET':'POST');ctx.fns.sshProvider.policy({provider:d.provider,url,method});if(method!=='GET'&&method!=='POST')throw Error('Invalid method');if(method==='GET'&&init.body!==undefined)throw Error('GET body denied');
    const tunnel=await ctx.fns.codexTunnel.openProduction({instance:d.instance,signal:init.signal});close=tunnel.close;const signal=init.signal?AbortSignal.any([init.signal,tunnel.signal]):tunnel.signal;
    const headers:Record<string,string>={};for(const [k,v] of Object.entries(init.headers))if(!['host','cookie','connection','content-length','proxy-authorization','set-cookie','accept-encoding'].includes(k.toLowerCase()))headers[k.toLowerCase()]=v;
    if(['codex','claude-code','kimi-coding'].includes(d.provider)){let tokens=row!.value.tokens;if(!tokens||typeof tokens.access!=='string'||!Number.isFinite(tokens.expires))throw Error('Invalid local credentials');if(tokens.expires<=Date.now()+60000)tokens=await ctx.fns.sshProvider.refresh({provider:d.provider,proxyPort:tunnel.port,signal,store,row:row!});delete headers['x-api-key'];delete headers['chatgpt-account-id'];headers.authorization='Bearer '+tokens.access;if(d.provider==='codex'){ctx.fns.codexTunnel.identity({t:tokens});headers['chatgpt-account-id']=tokens.accountId;}}
    if(d.provider==='opencode'){const route=new URL(url).pathname;const anonymous=route.startsWith('/v2/docs/')||route==='/inference/openai/v1/chat/completions'||route==='/inference/v1/models'||route==='/inference/go/v1/models';if(!anonymous&&!headers.authorization?.trim())throw Error('OpenCode authorization required');headers['user-agent']='Hyper/OpenCode';if(url.startsWith('https://opencode.ai/v2/docs/')){for(const key of Object.keys(headers))delete headers[key];headers.accept='text/markdown';headers['user-agent']='Hyper/OpenCode';}}
    response=await ctx.fns.sshProvider.request({provider:d.provider,url,method,headers,body:init.body===undefined?undefined:new TextEncoder().encode(init.body),proxyPort:tunnel.port,signal,timeoutMs:120000});
    if(!response.body){await done();return response;}const reader=response.body.getReader();let terminal=false;const abort=()=>{if(!terminal){terminal=true;void reader.cancel().finally(done).catch(()=>undefined)}};init.signal?.addEventListener('abort',abort,{once:true});const finish=async()=>{init.signal?.removeEventListener('abort',abort);await done()};
    return new Response(new ReadableStream<Uint8Array>({async pull(controller){try{const item=await reader.read();if(item.done){terminal=true;controller.close();await finish()}else controller.enqueue(item.value)}catch(e){terminal=true;controller.error(e);await finish()}},async cancel(){terminal=true;try{await reader.cancel()}finally{await finish()}}}),{status:response.status,statusText:response.statusText,headers:response.headers});
    }catch(error){await done();if(error instanceof Error&&error.message.startsWith('SSH OAuth account requires secure onboarding:'))throw error;throw Error('SSH provider request failed; no fallback')}
}
