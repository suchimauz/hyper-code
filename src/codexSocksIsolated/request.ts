/**
 * Stream allowlisted Codex HTTPS requests through a numeric loopback SOCKS proxy
 *
 * Unconnected transport building block; no existing dispatcher references this procedure. Use only with an already authorized local SOCKS listener. Preserves remote DNS and verified TLS, rejects redirects, caps POST data at 8 MiB, filters headers, and releases the lifecycle callback once after terminal cleanup. Does not establish SSH, read credentials, retry, or fall back to direct networking.
 * @param opts.url Allowlisted HTTPS Codex token, response, model discovery, or usage endpoint.
 * @param opts.proxyPort SOCKS5 listener port on fixed numeric 127.0.0.1; remote proxy addresses cannot be supplied. @minimum 1 @maximum 65535
 * @param opts.method Exact method required by the selected endpoint. @default GET
 * @param opts.headers Request headers filtered to authentication and Codex metadata; malformed CRLF values are rejected.
 * @param opts.body Optional POST bytes capped at 8388608 bytes; GET bodies are refused.
 * @param opts.signal Cancellation signal retained through response EOF, failure, or cancellation.
 * @param opts.timeoutMs Total deadline covering SOCKS negotiation, verified TLS, headers and stream consumption. @default 3000 @minimum 1 @maximum 120000
 * @param opts.onDone Once-only lease release notification for pre-header failure, body EOF, stream error, or cancellation; callback errors are isolated.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Allowlisted HTTPS Codex token, response, model discovery, or usage endpoint. */
        url: string;
        /** SOCKS5 listener port on fixed numeric 127.0.0.1; remote proxy addresses cannot be supplied. @minimum 1 @maximum 65535 */
        proxyPort: number;
        /** Exact method required by the selected endpoint. @default GET */
        method?: 'GET'|'POST';
        /** Request headers filtered to authentication and Codex metadata; malformed CRLF values are rejected. */
        headers?: Record<string,string>;
        /** Optional POST bytes capped at 8388608 bytes; GET bodies are refused. */
        body?: Uint8Array;
        /** Cancellation signal retained through response EOF, failure, or cancellation. */
        signal?: AbortSignal;
        /** Total deadline covering SOCKS negotiation, verified TLS, headers and stream consumption. @default 3000 @minimum 1 @maximum 120000 */
        timeoutMs?: number;
        /** Once-only lease release notification for pre-header failure, body EOF, stream error, or cancellation; callback errors are isolated. */
        onDone?: ()=>void;
    },
): Promise<Response> {
    const net=await import('node:net');
    const tls=await import('node:tls');
    const https=await import('node:https');
    
    /** Scratch candidate: explicit loopback proxy, remote DNS, no retries. */
    async function tunnel(host:string,port:number,proxyPort:number,signal?:AbortSignal,timeout=1000):Promise<import('node:net').Socket>{
     if(signal?.aborted)throw Error('aborted');
     const name=Buffer.from(host);if(!name.length||name.length>255)throw Error('hostname length');
     const s=net.connect({host:'127.0.0.1',port:proxyPort});
     return new Promise((resolve,reject)=>{
     let buf=Buffer.alloc(0),stage=0,done=false;
     const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);s.off('data',data);s.off('error',fail);s.off('close',closed)};
     const fail=(e:Error)=>{if(done)return;done=true;clean();s.destroy();reject(e)};
     const abort=()=>fail(Error('aborted')),closed=()=>fail(Error('SOCKS disconnected'));
     const timer=setTimeout(()=>fail(Error('SOCKS timeout')),timeout);
     const data=(chunk:Buffer)=>{
     // Bound hostile negotiation input before concatenation. No application bytes expected before TLS ClientHello.
     if(buf.length+chunk.length>262)return fail(Error('SOCKS buffer limit'));
     buf=Buffer.concat([buf,chunk]);
     if(stage===0){if(buf.length<2)return;if(buf[0]!==5||buf[1]!==0)return fail(Error('SOCKS auth'));buf=buf.subarray(2);stage=1;s.write(Buffer.concat([Buffer.from([5,1,0,3,name.length]),name,Buffer.from([port>>8,port&255])]));}
     if(stage===1){if(buf.length<4)return;if(buf[0]!==5||buf[2]!==0||buf[1]!==0)return fail(Error('SOCKS rejected'));
     const atyp=buf[3];if(![1,3,4].includes(atyp))return fail(Error('SOCKS address type'));if(atyp===3&&buf.length<5)return;
     const n=atyp===1?10:atyp===4?22:7+buf[4];if(atyp===3&&buf[4]===0)return fail(Error('SOCKS empty address'));if(buf.length<n)return;if(buf.length!==n)return fail(Error('SOCKS trailing bytes'));
     done=true;s.pause();clean();resolve(s);}
     };
     s.on('data',data);s.once('error',fail);s.once('close',closed);signal?.addEventListener('abort',abort,{once:true});
     s.once('connect',()=>s.write(Buffer.from([5,1,0])));if(signal?.aborted)abort();
     });
    }
    type Options={proxyPort:number;signal?:AbortSignal;method?:'GET'|'POST';body?:Uint8Array;headers?:Record<string,string>;timeoutMs?:number;onDone?:()=>void;metrics?:{maxBuffered:number;cleanups:number}};
    /** Response promise resolves at headers; lifetime deadline/abort persists through EOF or cancel. No automatic redirects or decompression. */
    async function request(url:string,o:Options):Promise<Response>{
     let notified=false;const finish=()=>{if(notified)return;notified=true;try{o.onDone?.()}catch{/* Lease notification must not compromise socket cleanup. */}};
     try{return await perform(url,{...o,onDone:finish})}catch(e){finish();throw e}
    }
    async function perform(url:string,o:Options):Promise<Response>{
     const u=policy(url,o.method??'GET');
     if(!Number.isInteger(o.proxyPort)||o.proxyPort<1||o.proxyPort>65535)throw Error('proxy port');
     if(o.timeoutMs!==undefined&&(!Number.isFinite(o.timeoutMs)||o.timeoutMs<1||o.timeoutMs>120000))throw Error('deadline range');
     if(o.body&&o.body.byteLength>8*1024*1024)throw Error('POST size');
     if((o.method??'GET')==='GET'&&o.body?.byteLength)throw Error('GET body');
     const filtered:Record<string,string>={};for(const [key,value] of Object.entries(o.headers??{})){if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)||/[\r\n\0]/.test(value))throw Error('invalid header');if(['authorization','content-type','accept','chatgpt-account-id','openai-beta','originator','version','session_id','conversation_id','user-agent'].includes(key.toLowerCase()))filtered[key.toLowerCase()]=value;}
     filtered['accept-encoding']='identity';if(o.body)filtered['content-length']=String(o.body.byteLength);o={...o,headers:filtered};
     const deadline=o.timeoutMs??3000,start=Date.now();
     const socket=await tunnel(u.hostname,443,o.proxyPort,o.signal,deadline);
     if(o.signal?.aborted){socket.destroy();throw Error('aborted');}
     return new Promise((resolve,reject)=>{
     let secure:import('node:tls').TLSSocket,req:ReturnType<typeof https.request>,res:any,controller:ReadableStreamDefaultController<Uint8Array>|undefined,settled=false,ended=false,cleaned=false;
     const agent=new https.Agent({keepAlive:false});
     const cleanup=()=>{if(cleaned)return;cleaned=true;if(o.metrics)o.metrics.cleanups++;clearTimeout(timer);o.signal?.removeEventListener('abort',abort);res?.destroy();req?.destroy();secure?.destroy();socket.destroy();agent.destroy();o.onDone?.()};
     const fail=(e:Error)=>{if(ended)return;ended=true;if(!settled)reject(e);else controller?.error(e);cleanup()};
     const abort=()=>fail(Error('aborted'));
     const timer=setTimeout(()=>fail(Error('request deadline')),Math.max(1,deadline-(Date.now()-start)));
     o.signal?.addEventListener('abort',abort,{once:true});
     try{
     secure=tls.connect({socket,servername:u.hostname,rejectUnauthorized:true,checkServerIdentity:tls.checkServerIdentity});secure.on('error',fail);
     socket.resume();
     (agent as any).createConnection=()=>secure;
     req=https.request({hostname:u.hostname,port:443,path:u.pathname+u.search,method:o.method??'GET',headers:o.headers,agent},incoming=>{
     res=incoming;res.on('error',fail);res.on('aborted',()=>fail(Error('upstream aborted')));res.on('close',()=>{if(!ended&&!res.complete)fail(Error('upstream incomplete'))});
     if((res.statusCode??0)>=300&&(res.statusCode??0)<400)return fail(Error('redirect refused'));
     res.pause();
     const pump=()=>{if(ended||!controller)return;while((controller.desiredSize??0)>0){const chunk=res.read(Math.min(16384,res.readableLength));if(!chunk)break;controller.enqueue(new Uint8Array(chunk));}if(o.metrics)o.metrics.maxBuffered=Math.max(o.metrics.maxBuffered,65536-(controller.desiredSize??0)+res.readableLength);if(res.readableLength>2*1024*1024)fail(Error('response buffer limit'))};
     const body=new ReadableStream<Uint8Array>({
     start(c){controller=c;res.on('readable',()=>pump());res.on('end',()=>{if(ended)return;ended=true;c.close();cleanup()})},
     pull(){pump()},cancel(){ended=true;cleanup()}
     },{highWaterMark:65536,size:chunk=>chunk?.byteLength??0});
     const headers=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)headers.append(res.rawHeaders[i],res.rawHeaders[i+1]);
     const status=res.statusCode??502;
     if([204,205,304].includes(status)){ended=true;cleanup();settled=true;resolve(new Response(null,{status,headers}));return;}
     settled=true;resolve(new Response(body,{status,headers}));
     });req.on('error',fail);req.end(o.body);if(o.signal?.aborted)abort();
     }catch(e){fail(e as Error)}
     });
    }
    
    /** Pure production policy; no socket or credentials access. */
    function policy(url:string,method='GET'){
     const u=new URL(url);
     const routes:Record<string,string>={'auth.openai.com/oauth/token':'POST','chatgpt.com/backend-api/codex/responses':'POST','chatgpt.com/backend-api/codex/responses/compact':'POST','chatgpt.com/backend-api/codex/models':'GET','chatgpt.com/backend-api/wham/usage':'GET'};
     if(u.protocol!=='https:'||u.username||u.password||u.hash||(u.port&&u.port!=='443')||routes[u.hostname+u.pathname]!==method||(u.search&&u.pathname!=='/backend-api/codex/models'))throw Error('destination');
     return u;
    }
    
    return request(opts.url,opts);
}
