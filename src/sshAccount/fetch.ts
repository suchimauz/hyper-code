/**
 * Streams subscription HTTP requests over a pinned SSH connection
 *
 * Runs Python 3 on the SSH host to read and refresh isolated file credentials and stream provider HTTP back to existing protocol parsers. Requires a connected account and never copies credentials locally.
 * @param opts.ssh Pinned SSH instance and isolated subscription account identity.
 * @param opts.url Allowlisted HTTPS inference, model catalogue or quota URL for the selected provider.
 * @param opts.init HTTP payload and cancellation signal; real authorization is injected remotely.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Pinned SSH instance and isolated subscription account identity. */
        ssh: { instance:string; provider:"codex"|"claude-code"; account:string };
        /** Allowlisted HTTPS inference, model catalogue or quota URL for the selected provider. */
        url: string;
        /** HTTP payload and cancellation signal; real authorization is injected remotely. */
        init: {method?:string;headers?:Record<string,string>;body?:string;signal?:AbortSignal};
    },
): Promise<Response> {
    await ctx.fns.sshInstance.authorize({});
    const rows=await ctx.fns.sshAccount.registry({action:'list'});
    if(!rows.some(r=>r.instance===opts.ssh.instance&&r.provider===opts.ssh.provider&&r.account===opts.ssh.account&&r.status==='connected'))throw new Error('SSH subscription account is not connected');
    const c = await ctx.fns.sshInstance.connection({name:opts.ssh.instance});
    const script=await ctx.fns.sshAccount.inferenceScript({});
    const command="python3 -c '"+script.replaceAll("'","'\"'\"'")+"'";
    opts.init.signal?.throwIfAborted();
    const proc=Bun.spawn([c.bin,...c.args,c.host,command],{stdin:'pipe',stdout:'pipe',stderr:'ignore'});
    const abort=()=>proc.kill();opts.init.signal?.addEventListener('abort',abort,{once:true});
    proc.stdin.write(JSON.stringify({ssh:opts.ssh,url:opts.url,method:opts.init.method,headers:opts.init.headers,body:opts.init.body}));proc.stdin.end();
    const reader=proc.stdout.getReader();let buffer=new Uint8Array();let timer:ReturnType<typeof setTimeout>|undefined;
    try{
     const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{proc.kill();reject(new Error('Remote inference connection timed out'));},90000);});
     let header:any;
     while(!header){const item=await Promise.race([reader.read(),deadline]);if(item.done)throw new Error('Remote inference bridge failed; check Python 3 and isolated credential files');const joined=new Uint8Array(buffer.length+item.value.length);joined.set(buffer);joined.set(item.value,buffer.length);buffer=joined;const nl=buffer.indexOf(10);if(nl>=0){header=JSON.parse(new TextDecoder().decode(buffer.slice(0,nl)));buffer=buffer.slice(nl+1);}else if(buffer.length>65536)throw new Error('Invalid remote framing');}
     clearTimeout(timer);
     const stream=new ReadableStream<Uint8Array>({start(controller){if(buffer.length)controller.enqueue(buffer);},async pull(controller){try{const chunk=await reader.read();if(chunk.done){if(await proc.exited!==0)throw new Error('Remote inference bridge failed');controller.close();opts.init.signal?.removeEventListener('abort',abort);}else controller.enqueue(chunk.value);}catch(e){controller.error(e);proc.kill();opts.init.signal?.removeEventListener('abort',abort);}},cancel(){proc.kill();opts.init.signal?.removeEventListener('abort',abort);return reader.cancel();}});
     return new Response([204,205,304].includes(header.status)?null:stream,{status:header.status,headers:header.headers});
    }catch(e){clearTimeout(timer);proc.kill();opts.init.signal?.removeEventListener('abort',abort);throw e;}
}
