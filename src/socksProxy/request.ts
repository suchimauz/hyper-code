/**
 * Stream verified HTTPS through an explicit SOCKS5 proxy
 *
 * Use for remote-DNS HTTPS with bounded buffering and cancellation through body EOF. Never redirects, retries or falls back. Connection negotiation is capped at 30 seconds; total, header and idle deadlines bound transport lifetime.
 * @param opts.proxy Explicit proxy address and optional RFC1929 credentials.
 * @param opts.url Credential-free HTTPS destination.
 * @param opts.method HTTP method; defaults to GET.
 * @param opts.headers HTTP headers without reserved framing fields.
 * @param opts.body POST bytes capped at eight MiB.
 * @param opts.signal Cancel through body EOF.
 * @param opts.timeoutMs Total deadline; defaults to 3000 milliseconds, range 1–3600000.
 * @param opts.headerTimeoutMs Header deadline range 1–600000 milliseconds; default min(total,30000).
 * @param opts.idleTimeoutMs Idle deadline range 1–600000 milliseconds; default min(total,30000).
 * @param opts.onDone Once-only lifetime cleanup notification.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit proxy address and optional RFC1929 credentials. */
        proxy: {host:string;port:number;username?:string;password?:string};
        /** Credential-free HTTPS destination. */
        url: string;
        /** HTTP method; defaults to GET. */
        method?: 'GET'|'POST';
        /** HTTP headers without reserved framing fields. */
        headers?: Record<string,string>;
        /** POST bytes capped at eight MiB. */
        body?: Uint8Array;
        /** Cancel through body EOF. */
        signal?: AbortSignal;
        /** Total deadline; defaults to 3000 milliseconds, range 1–3600000. */
        timeoutMs?: number;
        /** Header deadline range 1–600000 milliseconds; default min(total,30000). */
        headerTimeoutMs?: number;
        /** Idle deadline range 1–600000 milliseconds; default min(total,30000). */
        idleTimeoutMs?: number;
        /** Once-only lifetime cleanup notification. */
        onDone?: ()=>void;
    },
): Promise<Response> {
    const tls=await import('node:tls'),https=await import('node:https');
    let notified=false,sent=false;
    const finish=()=>{if(notified)return;notified=true;try{opts.onDone?.()}catch{/* Notification cannot prevent socket cleanup. */}};
    const error=(code:string,message:string)=>ctx.fns.socksProxy.transportError({code,message,requestSent:sent});
    const systemCode=(e:NodeJS.ErrnoException)=>e.code&&/^[A-Z][A-Z0-9_]{1,63}$/.test(e.code)?' ('+e.code+')':'';
    try{
    let u:URL;try{u=new URL(opts.url)}catch{throw error('PROXY_CONFIG','Invalid HTTPS URL')}
    if(u.protocol!=='https:'||u.username||u.password||u.hash)throw error('PROXY_CONFIG','Only credential-free HTTPS URLs are supported');
    for(const [value,max] of [[opts.timeoutMs,3600000],[opts.headerTimeoutMs,600000],[opts.idleTimeoutMs,600000]] as const)if(value!==undefined&&(!Number.isFinite(value)||value<1||value>max))throw error('PROXY_CONFIG','Invalid transport deadline');
    if(opts.method!==undefined&&!['GET','POST'].includes(opts.method)||opts.body&&opts.body.byteLength>8*1024*1024||(opts.method??'GET')==='GET'&&opts.body?.byteLength)throw error('PROXY_CONFIG','Invalid HTTP method or body size');
    const headers:Record<string,string>={};for(const [k,v] of Object.entries(opts.headers??{})){if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(k)||/[\r\n\0]/.test(v)||['host','connection','transfer-encoding','content-length','upgrade','proxy-authorization','proxy-connection'].includes(k.toLowerCase()))throw error('PROXY_CONFIG','Invalid or reserved HTTP header');headers[k.toLowerCase()]=v;}
    headers['accept-encoding']='identity';if(opts.body)headers['content-length']=String(opts.body.byteLength);
    const deadline=opts.timeoutMs??3000,start=Date.now();
    const socket=await ctx.fns.socksProxy.connect({proxy:opts.proxy,host:u.hostname,port:Number(u.port||443),signal:opts.signal,timeoutMs:Math.min(deadline,30000)});
    if(opts.signal?.aborted){socket.destroy();throw error('ABORT_ERR','Request cancelled')}
    return await new Promise<Response>((resolve,reject)=>{
    let secure:import('node:tls').TLSSocket|undefined,req:import('node:http').ClientRequest|undefined,res:import('node:http').IncomingMessage|undefined,controller:ReadableStreamDefaultController<Uint8Array>|undefined,settled=false,ended=false,cleaned=false;
    const agent=new https.Agent({keepAlive:false});
    let idleTimer:ReturnType<typeof setTimeout>|undefined,headerTimer:ReturnType<typeof setTimeout>|undefined;
    const cleanup=()=>{if(cleaned)return;cleaned=true;clearTimeout(timer);clearTimeout(idleTimer);clearTimeout(headerTimer);opts.signal?.removeEventListener('abort',abort);res?.destroy();req?.destroy();secure?.destroy();socket.destroy();agent.destroy();finish()};
    const fail=(e:Error)=>{if(ended)return;ended=true;if(!settled)reject(e);else controller?.error(e);cleanup()};
    const abort=()=>fail(error('ABORT_ERR','Request cancelled'));
    const timer=setTimeout(()=>fail(error('PROXY_TIMEOUT','Total request deadline exceeded')),Math.max(1,deadline-(Date.now()-start)));
    headerTimer=setTimeout(()=>fail(error('PROXY_TIMEOUT','Response header deadline exceeded')),opts.headerTimeoutMs??Math.min(deadline,30000));
    const touch=()=>{if(ended)return;clearTimeout(idleTimer);idleTimer=setTimeout(()=>fail(error('PROXY_TIMEOUT','Response idle deadline exceeded')),opts.idleTimeoutMs??Math.min(deadline,30000))};touch();
    opts.signal?.addEventListener('abort',abort,{once:true});
    socket.on('error',(e:NodeJS.ErrnoException)=>fail(error('PROXY_CONNECTION_LOST','Proxy connection failed after negotiation'+systemCode(e))));
    try{
    secure=tls.connect({socket,servername:u.hostname,rejectUnauthorized:true,checkServerIdentity:tls.checkServerIdentity});
    let verified=false;secure.once('secureConnect',()=>{verified=true});secure.on('error',(e:NodeJS.ErrnoException)=>fail(error(verified?'PROXY_CONNECTION_LOST':'PROXY_TLS',(verified?'TLS connection lost':'TLS verification or handshake failed')+systemCode(e))));
    secure.on('close',()=>{if(!ended&&!res?.complete)fail(error('PROXY_CONNECTION_LOST','TLS connection closed before response completion'))});
    socket.resume();agent.createConnection=()=>secure!;
    req=https.request({hostname:u.hostname,port:Number(u.port||443),path:u.pathname+u.search,method:opts.method??'GET',headers,agent,maxHeaderSize:32768},incoming=>{
    res=incoming;clearTimeout(headerTimer);touch();
    res.on('error',()=>fail(error('PROXY_CONNECTION_LOST','Response stream failed')));res.on('aborted',()=>fail(error('PROXY_CONNECTION_LOST','Response stream aborted')));res.on('close',()=>{if(!ended&&!res?.complete)fail(error('PROXY_CONNECTION_LOST','Incomplete response'))});
    if((res.statusCode??0)>=300&&(res.statusCode??0)<400)return fail(error('PROXY_DENIED','HTTP redirect refused'));
    res.pause();
    const pump=()=>{if(ended||!controller||!res)return;if(res.readableLength>2*1024*1024)return fail(error('PROXY_PROTOCOL','Response buffer limit exceeded'));while((controller.desiredSize??0)>0){const chunk=res.read(Math.min(16384,res.readableLength));if(!chunk)break;controller.enqueue(new Uint8Array(chunk));}};
    const body=new ReadableStream<Uint8Array>({start(c){controller=c;res!.on('readable',()=>{touch();pump()});res!.on('end',()=>{if(ended)return;ended=true;c.close();cleanup()})},pull(){pump()},cancel(){ended=true;cleanup()}},{highWaterMark:65536,size:chunk=>chunk?.byteLength??0});
    try{const responseHeaders=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)responseHeaders.append(res.rawHeaders[i]!,res.rawHeaders[i+1]!);const status=res.statusCode??502;if([204,205,304].includes(status)){ended=true;cleanup();settled=true;resolve(new Response(null,{status,headers:responseHeaders}));return}const response=new Response(body,{status,headers:responseHeaders});settled=true;resolve(response)}catch{fail(error('PROXY_PROTOCOL','Invalid HTTP response headers'))}
    });
    req.on('error',(e:NodeJS.ErrnoException)=>fail(error('PROXY_CONNECTION_LOST','HTTP transport failed'+systemCode(e))));sent=true;req.end(opts.body);if(opts.signal?.aborted)abort();
    }catch{fail(error('PROXY_TLS','TLS transport initialization failed'))}
    });
    }catch(e){finish();throw e}
}
