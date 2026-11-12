/**
 * Open a bounded SOCKS5 tunnel using remote destination DNS
 *
 * Negotiate SOCKS5 no-auth or username/password authentication against an explicit proxy and return a paused socket. Never resolves destination DNS locally or falls back to direct networking.
 * @param opts.proxy Explicit proxy address and optional RFC1929 credentials.
 * @param opts.host Destination hostname sent as SOCKS domain address.
 * @param opts.port Destination TCP port. @minimum 1 @maximum 65535
 * @param opts.signal Cancel negotiation and destroy the socket.
 * @param opts.timeoutMs Connection and SOCKS negotiation deadline. @default 30000 @minimum 1 @maximum 3600000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit proxy address and optional RFC1929 credentials. */
        proxy: {host:string;port:number;username?:string;password?:string};
        /** Destination hostname sent as SOCKS domain address. */
        host: string;
        /** Destination TCP port. @minimum 1 @maximum 65535 */
        port: number;
        /** Cancel negotiation and destroy the socket. */
        signal?: AbortSignal;
        /** Connection and SOCKS negotiation deadline. @default 30000 @minimum 1 @maximum 3600000 */
        timeoutMs?: number;
    },
): Promise<import('node:net').Socket> {
    const net = await import('node:net');
    const error=(code:string,message:string)=>ctx.fns.socksProxy.transportError({code,message,requestSent:false});
    const {proxy,signal}=opts;
    if(!proxy.host||/[\s\0/@]/.test(proxy.host)||!Number.isInteger(proxy.port)||proxy.port<1||proxy.port>65535)throw error('PROXY_CONFIG','Invalid proxy address');
    const name=Buffer.from(opts.host),user=Buffer.from(proxy.username??''),password=Buffer.from(proxy.password??'');
    const auth=proxy.username!==undefined||proxy.password!==undefined;
    if(!name.length||name.length>255||!Number.isInteger(opts.port)||opts.port<1||opts.port>65535||auth&&(!user.length||user.length>255||!password.length||password.length>255))throw error('PROXY_CONFIG','Invalid SOCKS destination or authentication configuration');
    if(signal?.aborted)throw error('ABORT_ERR','Request cancelled');
    const timeout=opts.timeoutMs??30000;
    if(!Number.isFinite(timeout)||timeout<1||timeout>3600000)throw error('PROXY_CONFIG','Invalid connection deadline');
    return new Promise((resolve,reject)=>{
    const socket=net.connect({host:proxy.host,port:proxy.port});
    let buffer=Buffer.alloc(0),stage=0,done=false;
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);socket.off('data',data);socket.off('error',failed);socket.off('close',closed)};
    const fail=(e:Error)=>{if(done)return;done=true;cleanup();socket.destroy();reject(e)};
    const failed=(e:NodeJS.ErrnoException)=>fail(error(e.code==='ENOTFOUND'||e.code==='EAI_AGAIN'?'PROXY_DNS':['ECONNRESET','EPIPE'].includes(e.code??'')?'PROXY_CONNECTION_LOST':'PROXY_CONNECT','Proxy connection failed'+(e.code&&/^[A-Z][A-Z0-9_]{1,63}$/.test(e.code)?' ('+e.code+')':'')));
    const closed=()=>fail(error('PROXY_CONNECTION_LOST','Proxy disconnected during negotiation'));
    const abort=()=>fail(error('ABORT_ERR','Request cancelled'));
    const timer=setTimeout(()=>fail(error('PROXY_TIMEOUT','Proxy connection deadline exceeded')),timeout);
    const connect=()=>{stage=2;socket.write(Buffer.concat([Buffer.from([5,1,0,3,name.length]),name,Buffer.from([opts.port>>8,opts.port&255])]))};
    const data=(chunk:Buffer)=>{
    if(buffer.length+chunk.length>1024)return fail(error('PROXY_PROTOCOL','SOCKS negotiation buffer limit exceeded'));
    buffer=Buffer.concat([buffer,chunk]);
    if(stage===0){if(buffer.length<2)return;const version=buffer[0],method=buffer[1];buffer=buffer.subarray(2);if(version!==5)return fail(error('PROXY_PROTOCOL','Invalid SOCKS version'));if(method!==(auth?2:0))return fail(error('PROXY_AUTH','Proxy authentication method rejected'));if(auth){stage=1;socket.write(Buffer.concat([Buffer.from([1,user.length]),user,Buffer.from([password.length]),password]))}else connect();}
    if(stage===1){if(buffer.length<2)return;if(buffer[0]!==1||buffer[1]!==0)return fail(error('PROXY_AUTH','Proxy authentication rejected'));buffer=buffer.subarray(2);connect();}
    if(stage===2){if(buffer.length<4)return;if(buffer[0]!==5||buffer[2]!==0)return fail(error('PROXY_PROTOCOL','Invalid SOCKS reply'));if(buffer[1]!==0)return fail(error(buffer[1]===2?'PROXY_DENIED':[7,8].includes(buffer[1]!)?'PROXY_PROTOCOL':'PROXY_CONNECT','SOCKS destination connection rejected (REP '+buffer[1]+')'));const atyp=buffer[3];if(![1,3,4].includes(atyp!))return fail(error('PROXY_PROTOCOL','Invalid SOCKS address type'));if(atyp===3&&buffer.length<5)return;const n=atyp===1?10:atyp===4?22:7+buffer[4]!;if(atyp===3&&!buffer[4])return fail(error('PROXY_PROTOCOL','Empty SOCKS address'));if(buffer.length<n)return;if(buffer.length!==n)return fail(error('PROXY_PROTOCOL','Unexpected SOCKS trailing data'));done=true;socket.pause();cleanup();resolve(socket);}
    };
    socket.on('data',data);socket.once('error',failed);socket.once('close',closed);socket.once('connect',()=>socket.write(Buffer.from([5,1,auth?2:0])));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    });
}
