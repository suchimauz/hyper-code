import { Socket, isIP } from "node:net";
import { request, Agent } from "node:http";
/**
 * Probe the fixed IP geolocation endpoint through one SOCKS5 connection with bounded transport resources
 *
 * Internal transport for saved proxy checks. Connects only through the supplied saved SOCKS5 endpoint to ip-api.com:80 using remote DNS, with no redirect, retry or fallback. Closes all sockets on completion, cancellation and a ten-second deadline; never returns credentials or remote error text.
 * @param opts.proxy Previously validated saved proxy connection fields; never expose this internal helper as an HTTP endpoint.
 * @param opts.signal Request cancellation signal; abort closes the proxy socket.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Previously validated saved proxy connection fields; never expose this internal helper as an HTTP endpoint. */
        proxy: {host:string;port:number;username?:string;password?:string};
        /** Request cancellation signal; abort closes the proxy socket. */
        signal?: AbortSignal;
    },
): Promise<{ok:boolean;code?:string;retryAfter?:number;query?:string;country?:string;regionName?:string;city?:string;isp?:string;org?:string;as?:string;timezone?:string}> {
    const {proxy,signal}=opts;
    const socket=new Socket();
    let phase='proxy_connect';
    let pending: {n:number;resolve:(b:Buffer)=>void;reject:(e:Error)=>void}|undefined;
    let buffer=Buffer.alloc(0);
    let failure:Error|undefined;
    const fail=(code:string)=>{failure ??= new Error(code); pending?.reject(failure); pending=undefined; socket.destroy(failure);};
    const onError=(e:Error & {code?:string})=>{failure ??= new Error(phase==='proxy_connect' && ['ENOTFOUND','EAI_AGAIN'].includes(e.code??'')?'proxy_dns':phase==='proxy_connect'?'proxy_connect':'invalid_response'); pending?.reject(failure);pending=undefined;};
    socket.on('error',onError);
    const abort=()=>fail(signal?.reason instanceof Error && signal.reason.name==='TimeoutError'?'timeout':'cancelled');
    const timer=setTimeout(()=>fail('timeout'),10000);
    signal?.addEventListener('abort',abort,{once:true});
    const agent=new Agent({keepAlive:false});
    agent.createConnection=()=>socket;
    const flush=()=>{if(pending && buffer.length>=pending.n){const p=pending;pending=undefined;const b=buffer.subarray(0,p.n);buffer=buffer.subarray(p.n);p.resolve(b);}};
    const onData=(data:Buffer)=>{if(buffer.length+data.length>1024){fail('invalid_response');return;}buffer=Buffer.concat([buffer,data]);flush();};
    const onClose=()=>{if(pending)fail('invalid_response');};
    const read=(n:number):Promise<Buffer>=>new Promise((resolve,reject)=>{if(failure){reject(failure);return;}pending={n,resolve,reject};flush();});
    try {
     if(signal?.aborted)throw new Error(signal.reason instanceof Error && signal.reason.name==='TimeoutError'?'timeout':'cancelled');
     socket.on('data',onData);socket.on('close',onClose);
     await new Promise<void>((resolve,reject)=>{const err=()=>{socket.off('connect',connected);reject(failure??new Error('proxy_connect'));};const connected=()=>{socket.off('error',err);resolve();};socket.once('error',err);socket.once('connect',connected);socket.connect(proxy.port,proxy.host);});
     phase='socks';
     const auth=proxy.username!==undefined;
     socket.write(Buffer.from([5,1,auth?2:0]));
     const method=await read(2);
     if(method[0]!==5)throw new Error('invalid_response');
     if(method[1]!== (auth?2:0))throw new Error('auth_refused');
     if(auth){const u=Buffer.from(proxy.username!);const p=Buffer.from(proxy.password??'');if(!u.length||u.length>255||!p.length||p.length>255)throw new Error('auth_refused');socket.write(Buffer.concat([Buffer.from([1,u.length]),u,Buffer.from([p.length]),p]));const a=await read(2);if(a[0]!==1||a[1]!==0)throw new Error('auth_refused');}
     const domain=Buffer.from('ip-api.com');socket.write(Buffer.concat([Buffer.from([5,1,0,3,domain.length]),domain,Buffer.from([0,80])]));
     const reply=await read(4);
     if(reply[0]!==5||reply[2]!==0)throw new Error('invalid_response');
     if(reply[1]!==0)throw new Error('connect_refused');
     if(reply[3]===1)await read(6);else if(reply[3]===4)await read(18);else if(reply[3]===3){const len=(await read(1))[0]!;if(!len)throw new Error('invalid_response');await read(len+2);}else throw new Error('invalid_response');
     if(buffer.length)throw new Error('invalid_response');
     socket.off('data',onData);socket.off('close',onClose);phase='http';
     const result=await new Promise<{ok:boolean;code?:string;retryAfter?:number;query?:string;country?:string;regionName?:string;city?:string;isp?:string;org?:string;as?:string;timezone?:string}>((resolve,reject)=>{
     const req=request({host:'ip-api.com',port:80,path:'/json',method:'GET',agent,maxHeaderSize:8192,headers:{Host:'ip-api.com',Accept:'application/json',Connection:'close'}},res=>{
     if(res.statusCode!==200){const value=res.headers['retry-after'];const parsed=typeof value==='string'?(/^\d+$/.test(value)?Number(value):Math.ceil((Date.parse(value)-Date.now())/1000)):NaN;const seconds=Number.isFinite(parsed)?Math.min(3600,Math.max(1,parsed)):60;resolve(res.statusCode===429?{ok:false,code:'rate_limit',retryAfter:seconds}:{ok:false,code:'http_error'});res.destroy();return;}
     if(res.headers['content-encoding'] && res.headers['content-encoding']!=='identity'){res.destroy();reject(new Error('invalid_response'));return;}
     let size=0;const chunks:Buffer[]=[];
     res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>65536){res.destroy();reject(new Error('invalid_response'));return;}chunks.push(chunk);});
     res.on('error',()=>reject(failure??new Error('invalid_response')));
     res.on('aborted',()=>reject(failure??new Error('invalid_response')));
     res.on('end',()=>{try{const json=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!json||json.status!=='success'||typeof json.query!=='string'||!isIP(json.query))throw new Error('invalid_response');const output:{ok:boolean;query:string;country?:string;regionName?:string;city?:string;isp?:string;org?:string;as?:string;timezone?:string}={ok:true,query:json.query};for(const key of ['country','regionName','city','isp','org','as','timezone'] as const){if(typeof json[key]==='string')output[key]=json[key].slice(0,512);}resolve(output);}catch{reject(new Error('invalid_response'));}});
     });req.on('error',()=>reject(failure??new Error('invalid_response')));req.end();
     });return result;
    } catch(e){const code=failure?.message??(e instanceof Error?e.message:'invalid_response');return {ok:false,code:['timeout','cancelled','proxy_dns','proxy_connect','auth_refused','connect_refused','http_error','rate_limit','invalid_response'].includes(code)?code:'invalid_response'};
    } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);socket.off('data',onData);socket.off('close',onClose);socket.destroy();agent.destroy();}
}
