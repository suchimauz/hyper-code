/**
 * Stream allowlisted Codex HTTPS through a dedicated pinned SSH forward
 *
 * Use for locally held credentials with remote network egress. Bun SOCKS proxies are unsupported, so a dedicated loopback fixed SSH forward resolves the destination remotely. TLS verifies the original hostname. Redirects are returned, never followed. A tunnel is owned by one response and closed on EOF, cancellation, error, caller abort or a ten-minute lifetime deadline. Supports string request bodies and identity-encoded response streams, not uploads, arbitrary destinations or connection pooling. No credentials are written to disk, command arguments or logs.
 * @param opts.instance Exact configured SSH instance name with confirmed host-key pins.
 * @param opts.url Allowlisted Codex HTTPS endpoint.
 * @param opts.init HTTP method, local credential headers, optional string body and cancellation signal. Signal remains active through response consumption.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact configured SSH instance name with confirmed host-key pins. */
        instance: string;
        /** Allowlisted Codex HTTPS endpoint. */
        url: string;
        /** HTTP method, local credential headers, optional string body and cancellation signal. Signal remains active through response consumption. */
        init: {method?:string;headers?:Record<string,string>;body?:string;signal?:AbortSignal};
    },
): Promise<Response> {
    const target=await ctx.fns.codexTunnel.validate({url:opts.url,method:opts.init.method});
    opts.init.signal?.throwIfAborted();
    const headers=new Headers(opts.init.headers);
    for(const key of ['host','connection','content-length','transfer-encoding','proxy-authorization','proxy-connection','upgrade']) if(headers.has(key))throw new Error('Unsafe Codex tunnel request header');
    headers.set('accept-encoding','identity');
    const connection=await ctx.fns.sshInstance.connection({name:opts.instance});
    opts.init.signal?.throwIfAborted();
    const net=await import('node:net'); const https=await import('node:https'); const tls=await import('node:tls');
    const reservation=net.createServer();
    await new Promise<void>((resolve,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolve);});
    const port=(reservation.address() as import('node:net').AddressInfo).port;
    await new Promise<void>((resolve,reject)=>reservation.close(e=>e?reject(e):resolve()));
    // Disable multiplexing: this request must own the forward and its lifetime.
    // Keep every host-key, identity, authentication and config isolation option.
    const args:string[]=[];
    for(let i=0;i<connection.args.length;i++) {const value=connection.args[i];if(value==='--')continue;if(value==='-o'&&/^(ControlMaster|ControlPersist|ControlPath)=/.test(connection.args[i+1]??'')){i++;continue;}args.push(value);}
    args.push('-o','ControlMaster=no','-o','ControlPath=none','-o','ControlPersist=no','-o','ExitOnForwardFailure=yes','-o','ForkAfterAuthentication=no','-N','-v','-L','127.0.0.1:'+port+':'+target.hostname+':443','--',connection.host);
    const proc=Bun.spawn([connection.bin,...args],{stdin:'ignore',stdout:'ignore',stderr:'pipe'});
    let request:import('node:http').ClientRequest|undefined; let incoming:import('node:http').IncomingMessage|undefined; let cleaned=false;
    const lifetime=new AbortController();
    const abort=()=>lifetime.abort(new Error('Codex tunnel cancelled'));
    opts.init.signal?.addEventListener('abort',abort,{once:true});
    const deadline=setTimeout(()=>lifetime.abort(new Error('Codex tunnel lifetime exceeded')),600000);
    const cleanup=()=>{if(cleaned)return;cleaned=true;clearTimeout(deadline);opts.init.signal?.removeEventListener('abort',abort);request?.destroy();incoming?.destroy();proc.kill();};
    lifetime.signal.addEventListener('abort',cleanup,{once:true});
    if(opts.init.signal?.aborted)abort();
    try {
     let readyResolve!:()=>void; let readyReject!:(e:Error)=>void;
     const ready=new Promise<void>((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
     const readinessTimer=setTimeout(()=>readyReject(new Error('Codex tunnel startup timeout')),15000);
     const onAbort=()=>readyReject(new Error('Codex tunnel cancelled'));
     lifetime.signal.addEventListener('abort',onAbort,{once:true});
     const drain=(async()=>{let pending='';const decoder=new TextDecoder();for await(const chunk of proc.stderr){pending+=decoder.decode(chunk,{stream:true});const lines=pending.split('\n');pending=lines.pop()!.slice(-2048);for(const line of lines)if(line.includes('Local forwarding listening on 127.0.0.1 port '+port+'.'))readyResolve();} })();
     void drain.catch(()=>readyReject(new Error('Codex tunnel startup failed')));
     void proc.exited.then(()=>{readyReject(new Error('Codex SSH tunnel exited'));if(!cleaned)lifetime.abort(new Error('Codex SSH tunnel exited'));});
     try {lifetime.signal.throwIfAborted();await ready;lifetime.signal.throwIfAborted();} finally {clearTimeout(readinessTimer);lifetime.signal.removeEventListener('abort',onAbort);}
     const response=await new Promise<import('node:http').IncomingMessage>((resolve,reject)=>{
      request=https.request({hostname:'127.0.0.1',port,servername:target.hostname,path:target.path,method:target.method,headers:{...Object.fromEntries(headers),host:target.hostname},agent:false,rejectUnauthorized:true,checkServerIdentity:(_host,cert)=>tls.checkServerIdentity(target.hostname,cert),signal:lifetime.signal},resolve);
      const headerTimer=setTimeout(()=>{request?.destroy();reject(new Error('Codex tunnel response timeout'));},30000);
      request.once('response',()=>clearTimeout(headerTimer));request.once('error',()=>{clearTimeout(headerTimer);reject(new Error('Codex tunnel HTTPS request failed'));});
      request.end(opts.init.body);
     });
     incoming=response;
     const responseHeaders=new Headers();for(const [key,value] of Object.entries(response.headers)){if(value!==undefined)for(const v of Array.isArray(value)?value:[value])responseHeaders.append(key,v);}
     for(const key of ['connection','transfer-encoding','keep-alive','proxy-authenticate','proxy-authorization','trailer','upgrade'])responseHeaders.delete(key);
     if(response.headers['content-encoding']&&response.headers['content-encoding']!=='identity')throw new Error('Codex tunnel requires identity response encoding');
     const status=response.statusCode??502;
     if([204,205,304].includes(status)){cleanup();return new Response(null,{status,headers:responseHeaders});}
     const iterator=response[Symbol.asyncIterator]();
     const stream=new ReadableStream<Uint8Array>({async pull(controller){try{const next=await iterator.next();if(next.done){controller.close();cleanup();}else controller.enqueue(new Uint8Array(next.value));}catch{controller.error(new Error('Codex tunnel response interrupted'));cleanup();}},cancel(){cleanup();}});
     return new Response(stream,{status,headers:responseHeaders});
    } catch {cleanup();throw new Error('Codex tunnel request failed');}
}
