/**
 * Refresh bound OAuth credentials through the same pinned SOCKS tunnel
 *
 * Refresh Codex, Claude and Kimi locally with provider-specific clients. Persists recovery before token rotation and saves rotated credentials encrypted before returning; ambiguous failures never retry or use remote stale tokens.
 * @param opts.provider OAuth subscription provider.
 * @param opts.proxyPort Owned SOCKS listener port.
 * @param opts.signal Whole request cancellation.
 * @param opts.store Encrypted compare-and-swap store.
 * @param opts.row Bound encrypted record already verified by dispatcher.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** OAuth subscription provider. */
        provider: string;
        /** Owned SOCKS listener port. */
        proxyPort: number;
        /** Whole request cancellation. */
        signal?: AbortSignal;
        /** Encrypted compare-and-swap store. */
        store: {save:(revision:number|null,value:object)=>Promise<number>};
        /** Bound encrypted record already verified by dispatcher. */
        row: {revision:number;value:{mode:string;tokens:{access:string;refresh:string;expires:number;accountId?:string};[key:string]:unknown}};
    },
): Promise<{access:string;refresh:string;expires:number;accountId?:string}> {
    const {provider:p,row,store}=opts,t=row.value.tokens;
    const config:Record<string,[string,string]>={'codex':['https://auth.openai.com/oauth/token','app_EMoamEEZ73f0CkXaXp7hrann'],'claude-code':['https://console.anthropic.com/v1/oauth/token','9d1c250a-e61b-44d9-88ed-5944d1962f5e'],'kimi-coding':['https://auth.kimi.com/api/oauth/token','17e5f671-d194-4dfb-9706-5516cb48c098']};const c=config[p];if(!c||!t.refresh)throw Error('OAuth refresh unavailable');
    const revision=await store.save(row.revision,{...row.value,mode:'recovery'});
    const data={grant_type:'refresh_token',refresh_token:t.refresh,client_id:c[1]!};
    try{const response=await ctx.fns.sshProvider.request({provider:p,url:c[0]!,proxyPort:opts.proxyPort,signal:opts.signal,method:'POST',timeoutMs:45000,headers:{'content-type':p==='kimi-coding'?'application/x-www-form-urlencoded':'application/json','x-msh-platform':'hyper-code2','x-msh-version':'0.1','x-msh-device-id':'hyper-code2'},body:new TextEncoder().encode(p==='kimi-coding'?new URLSearchParams(data).toString():JSON.stringify(data))});if(!response.ok){await response.body?.cancel();throw Error('Refresh rejected')}
    const v=await response.json() as {access_token?:string;refresh_token?:string;expires_in?:number};if(typeof v.access_token!=='string'||!v.access_token||!Number.isFinite(v.expires_in)||v.expires_in!<=0)throw Error('Invalid refresh response');const tokens={...t,access:v.access_token,refresh:v.refresh_token||t.refresh,expires:Date.now()+v.expires_in!*1000};if(p==='codex'){ctx.fns.codexTunnel.identity({t:tokens as {access:string;refresh:string;expires:number;accountId:string}})}
    const pending=(ctx.state as any).sshProviderRecovery??=new Map();const key=JSON.stringify([row.value.owner,row.value.binding]);pending.set(key,{revision,value:{...row.value,mode:'socks',tokens,rotated:true}});
    await store.save(revision,{...row.value,mode:'socks',tokens,rotated:true});pending.delete(key);return tokens;
    }catch{throw Error('OAuth recovery required; no fallback or repeated refresh')}
}
