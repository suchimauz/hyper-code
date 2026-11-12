/**
 * Stream provider HTTPS over an authorized pinned SSH SOCKS listener
 *
 * Shared transport for six providers with remote DNS, verified TLS, backpressure and cancellation. Never redirects, retries or falls back to direct networking.
 * @param opts.provider Provider selecting fixed endpoint policy.
 * @param opts.url Allowlisted HTTPS endpoint.
 * @param opts.proxyPort Authorized loopback SOCKS listener port.
 * @param opts.method HTTP method required by endpoint.
 * @param opts.headers Authentication and provider metadata headers.
 * @param opts.body POST bytes capped at eight MiB.
 * @param opts.signal Cancellation through body completion.
 * @param opts.timeoutMs Total stream deadline in milliseconds, through body EOF. @default 3000 @minimum 1 @maximum 3600000
 * @param opts.idleTimeoutMs Inactivity deadline in milliseconds: fails with "idle deadline" when neither headers nor body bytes arrive for this long; reset on every received chunk. Use for long model streams instead of a short total deadline. @minimum 1 @maximum 600000
 * @param opts.onDone Once-only terminal cleanup callback.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider selecting fixed endpoint policy. */
        provider: string;
        /** Allowlisted HTTPS endpoint. */
        url: string;
        /** Authorized loopback SOCKS listener port. */
        proxyPort: number;
        /** HTTP method required by endpoint. */
        method?: 'GET'|'POST';
        /** Authentication and provider metadata headers. */
        headers?: Record<string,string>;
        /** POST bytes capped at eight MiB. */
        body?: Uint8Array;
        /** Cancellation through body completion. */
        signal?: AbortSignal;
        /** Total stream deadline in milliseconds, through body EOF. @default 3000 @minimum 1 @maximum 3600000 */
        timeoutMs?: number;
        /** Inactivity deadline in milliseconds, reset on headers and every received chunk. @minimum 1 @maximum 600000 */
        idleTimeoutMs?: number;
        /** Once-only terminal cleanup callback. */
        onDone?: ()=>void;
    },
): Promise<Response> {
    let notified=false;
    const finish=()=>{if(notified)return;notified=true;try{opts.onDone?.()}catch{/* Lease notification cannot prevent cleanup. */}};
    const o=opts,url=opts.url;
    try {
         const u=ctx.fns.sshProvider.policy({provider:opts.provider,url,method:o.method??'GET'});
         if(!Number.isInteger(o.proxyPort)||o.proxyPort<1||o.proxyPort>65535)throw Error('proxy port');
         if(o.timeoutMs!==undefined&&(!Number.isFinite(o.timeoutMs)||o.timeoutMs<1||o.timeoutMs>3600000))throw Error('deadline range');
         if(o.idleTimeoutMs!==undefined&&(!Number.isFinite(o.idleTimeoutMs)||o.idleTimeoutMs<1||o.idleTimeoutMs>600000))throw Error('idle deadline range');
         if(o.body&&o.body.byteLength>8*1024*1024)throw Error('POST size');
         if((o.method??'GET')==='GET'&&o.body?.byteLength)throw Error('GET body');
         const filtered:Record<string,string>={};for(const [key,value] of Object.entries(o.headers??{})){if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)||/[\r\n\0]/.test(value))throw Error('invalid header');if(['authorization','content-type','accept','chatgpt-account-id','openai-beta','originator','version','session_id','conversation_id','x-client-request-id','x-codex-turn-state','user-agent','anthropic-version','anthropic-beta','x-api-key','x-goog-api-key','x-msh-platform','x-msh-version','x-msh-device-id'].includes(key.toLowerCase()))filtered[key.toLowerCase()]=value;}
         filtered['accept-encoding']='identity';if(o.body)filtered['content-length']=String(o.body.byteLength);
         return await ctx.fns.socksProxy.request({proxy:{host:'127.0.0.1',port:o.proxyPort},url:u.href,method:o.method,headers:Object.fromEntries(Object.entries(filtered).filter(([k])=>k!=='content-length')),body:o.body,signal:o.signal,timeoutMs:o.timeoutMs,idleTimeoutMs:o.idleTimeoutMs,onDone:finish});
    } catch(e) {finish();throw e;}
}
