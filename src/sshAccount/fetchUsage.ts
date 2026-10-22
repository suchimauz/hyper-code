/**
 * Fetches subscription quota through SSH without exporting remote credentials
 *
 * Use for connected Codex, Claude or Kimi Coding accounts on a pinned SSH instance. Requests only fixed HTTPS usage endpoints with GET through the remote credential refresh bridge. Buffers at most one MiB and enforces an overall deadline. Returns provider status and body for quota parsers.
 * @param opts.instance Exact registered SSH instance name.
 * @param opts.provider Provider whose remote credentials authorize the request.
 * @param opts.account Exact remote account name, not a synthetic local account ID.
 * @param opts.timeoutMs Overall deadline including SSH startup, remote refresh and body consumption. @default 5000 @minimum 500 @maximum 30000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact registered SSH instance name. */
        instance: string;
        /** Provider whose remote credentials authorize the request. */
        provider: "codex" | "claude-code" | "kimi-coding";
        /** Exact remote account name, not a synthetic local account ID. */
        account: string;
        /** Overall deadline including SSH startup, remote refresh and body consumption. @default 5000 @minimum 500 @maximum 30000 */
        timeoutMs?: number;
    },
): Promise<Response> {
    const ms=opts.timeoutMs ?? 5000;
    if (!Number.isFinite(ms) || ms<500 || ms>30000) throw new Error('Usage timeout must be between 500 and 30000 milliseconds');
    if (!['codex','claude-code','kimi-coding'].includes(opts.provider)) throw new Error('Unsupported SSH usage provider');
    const url=opts.provider==='codex'?'https://chatgpt.com/backend-api/wham/usage':opts.provider==='kimi-coding'?'https://api.kimi.com/coding/v1/usages':'https://api.anthropic.com/api/oauth/usage';
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    const work=async()=>{
     const response=await ctx.fns.sshAccount.fetch({ssh:{instance:opts.instance,provider:opts.provider,account:opts.account},url,init:{method:'GET',headers:{accept:'application/json','content-type':'application/json'},signal:controller.signal}});
     if(controller.signal.aborted){await response.body?.cancel();throw new Error('Remote usage request timed out');}
     const reader=response.body?.getReader();
     const chunks:Uint8Array[]=[];let length=0;
     try {
     if(reader)while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>1048576)throw new Error('Remote usage response exceeds limit');chunks.push(chunk.value);}
     } finally {if(reader)await reader.cancel();}
     const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
     return new Response([204,205,304].includes(response.status)?null:bytes,{status:response.status,headers:{'content-type':'application/json'}});
    };
    try {
     return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Remote usage request timed out'));},ms);})]);
    } finally {clearTimeout(timer);controller.abort();}
}
