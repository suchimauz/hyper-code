/**
 * Streams subscription HTTP requests over a pinned SSH connection
 *
 * Runs Python 3 on the SSH host to read and refresh isolated file credentials and stream provider HTTP back to existing protocol parsers. Requires a connected account for Codex/Claude; coding plans and OpenCode forward caller authorization only on SSH stdin, never in command arguments or logs.
 * Active worker-bound cron grants may use only their exact OpenCode Go DeepSeek descriptor, body model and fixed endpoint. The live task, run, owner, grant and authority version are checked before dispatch; no SSH management capability is returned.
 * @param opts.ssh Pinned SSH instance and isolated subscription account identity.
 * @param opts.url Allowlisted HTTPS inference, model catalogue or quota URL for the selected provider.
 * @param opts.init HTTP payload and cancellation signal; real authorization is injected remotely.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Pinned SSH instance and isolated subscription account identity. */
        ssh: { instance:string; provider:"codex"|"claude-code"|"kimi-coding"|"zai-coding"|"minimax-coding"|"opencode"; account:string };
        /** Allowlisted HTTPS inference, model catalogue or quota URL for the selected provider. */
        url: string;
        /** HTTP payload and cancellation signal; real authorization is injected remotely. */
        init: {method?:string;headers?:Record<string,string>;body?:string;signal?:AbortSignal};
    },
): Promise<Response> {
    // Snapshot caller data before any await; only this fixed bridge may use the
    // private null-session connection after validating an active cron capability.
    opts = { ssh: { ...opts.ssh }, url: opts.url, init: { ...opts.init, headers: { ...opts.init.headers } } };
    const service = session ? (ctx.state as any).cron?.inferenceServices?.get(session) : null;
    const checkService = async () => {
        if (!session || (ctx.state as any).cron?.inferenceServices?.get(session) !== service) throw new Error("Expired cron inference capability");
        const d = service.inference;
        if (!d || d.provider !== "opencode" || d.account !== "default" || d.model !== "deepseek-v4.1-flash" || typeof d.instance !== "string" || !d.instance || opts.ssh.provider !== d.provider || opts.ssh.instance !== d.instance || opts.ssh.account !== d.account) throw new Error("Cron inference descriptor mismatch");
        const read = ["https://opencode.ai/inference/go/v1/models", "https://opencode.ai/v2/docs/console/go"].includes(opts.url);
        if (read) {
            if (opts.init.method !== "GET" || opts.init.body !== undefined) throw new Error("Cron catalogue requires GET without body");
        } else {
            if (opts.url !== "https://opencode.ai/inference/go/openai/v1/chat/completions" || opts.init.method !== "POST" || typeof opts.init.body !== "string") throw new Error("Cron inference endpoint denied");
            const body = JSON.parse(opts.init.body);
            if (!body || Array.isArray(body) || body.model !== d.model) throw new Error("Cron inference model mismatch");
        }
        const rows = await ctx.fns.procs.db.select({sql:`SELECT g.scopes FROM cron_grants g JOIN cron_tasks t ON t.name=g.task_name JOIN cron_runs r ON r.id=?
            WHERE g.task_name=? AND g.target_fn=? AND g.owner_id=? AND g.definition_version=?
            AND t.fn=g.target_fn AND t.authority_version=g.definition_version AND t.enabled=TRUE
            AND r.task_name=g.task_name AND r.fn=g.target_fn AND r.authority_version=g.definition_version AND r.status='running'`,
            params:[service.runId,service.taskName,service.targetFn,service.ownerId,service.definitionVersion]});
        const scopes = typeof rows[0]?.scopes === "string" ? JSON.parse(rows[0].scopes) : rows[0]?.scopes;
        if (!scopes || JSON.stringify(scopes) !== service.storedScopes || (ctx.state as any).cron?.inferenceServices?.get(session) !== service) throw new Error("Revoked cron inference grant");
    };
    if (service) await checkService();
    else await ctx.fns.sshInstance.authorize({});
    // Coding plans bridge the caller's own plan key, so they need no remote
    // account registry row; codex/claude-code load their credentials remotely.
    const plan=opts.ssh.provider==='zai-coding'||opts.ssh.provider==='minimax-coding'||opts.ssh.provider==='opencode';
    if (!plan&&!['codex','claude-code','kimi-coding'].includes(opts.ssh.provider)) throw new Error('SSH provider supports authorization only, not inference');
    if(!plan){
    const rows=await ctx.fns.sshAccount.registry({action:'list'});
    if(!rows.some(r=>r.instance===opts.ssh.instance&&r.provider===opts.ssh.provider&&r.account===opts.ssh.account&&r.status==='connected'))throw new Error('SSH subscription account is not connected');
    }
    let c: {bin:string;args:string[];host:string};
    if (service) {
        // Never return or pass this derived context to the target or other helpers.
        const bridge = Object.create(ctx); bridge.session = null;
        c = await bridge.fns.sshInstance.connection({name:opts.ssh.instance});
    } else c = await ctx.fns.sshInstance.connection({name:opts.ssh.instance});
    const script=await ctx.fns.sshAccount.inferenceScript({});
    const command="python3 -c '"+script.replaceAll("'","'\"'\"'")+"'";
    const fail = (phase: "before_dispatch" | "ambiguous" | "permanent", cause?: unknown) =>
        Object.assign(new Error(phase === "ambiguous"
            ? "SSH inference interrupted; provider acceptance is uncertain. Resume manually."
            : phase === "permanent" ? "SSH inference configuration or credentials rejected" : "SSH connection interrupted before provider dispatch", { cause }), {
            transportFailure: { kind: "ssh_transport" as const, phase, retryable: phase === "before_dispatch" },
        });
    opts.init.signal?.throwIfAborted();
    let proc: ReturnType<typeof Bun.spawn>;
    try { proc=Bun.spawn([c.bin,...c.args,c.host,command],{stdin:'pipe',stdout:'pipe',stderr:'ignore'}); }
    catch (error) { throw fail("permanent", error); }
    // This protocol never dispatches inference until we explicitly send consent.
    let dispatched=false;
    const abort=()=>proc.kill();opts.init.signal?.addEventListener('abort',abort,{once:true});
    const reader=(proc.stdout as ReadableStream<Uint8Array>).getReader();
    const stdin=proc.stdin as import("bun").FileSink;
    let buffer=new Uint8Array();let timer:ReturnType<typeof setTimeout>|undefined;
    const cleanup=()=>{clearTimeout(timer);proc.kill();opts.init.signal?.removeEventListener('abort',abort);};
    const line=async(deadline:Promise<never>)=>{
        while(true){
            const nl=buffer.indexOf(10);
            if(nl>65536 || (nl<0 && buffer.length>65536))throw fail(dispatched ? "ambiguous" : "permanent");
            if(nl>=0){let value;try{value=JSON.parse(new TextDecoder().decode(buffer.slice(0,nl)));}catch(error){throw fail(dispatched ? "ambiguous" : "permanent",error);}buffer=buffer.slice(nl+1);return value;}
            const item=await Promise.race([reader.read(),deadline]);
            if(item.done)throw new Error('Remote bridge ended');
            const joined=new Uint8Array(buffer.length+item.value.length);joined.set(buffer);joined.set(item.value,buffer.length);buffer=joined;
        }
    };
    try{
        const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{proc.kill();reject(new Error('Remote inference connection timed out'));},90000);});
        stdin.write(JSON.stringify({ssh:opts.ssh,url:opts.url,method:opts.init.method,headers:opts.init.headers,body:opts.init.body})+"\n");
        await Promise.race([stdin.flush(),deadline]);
        const ready=await line(deadline);
        if(ready.ready!==true)throw fail("permanent");
        opts.init.signal?.throwIfAborted();
        if (service) await checkService();
        dispatched=true; // Set BEFORE writing: a failed write may still reach the remote process.
        stdin.write("dispatch\n");await Promise.race([stdin.flush(),deadline]);stdin.end();
        const header=await line(deadline);
        if(header.rejected===true)throw fail("permanent");
        if(!Number.isInteger(header.status)||header.status<200||header.status>599)throw new Error('Invalid remote status');
        clearTimeout(timer);
        const stream=new ReadableStream<Uint8Array>({
            start(controller){if(buffer.length)controller.enqueue(buffer);},
            async pull(controller){try{
                const chunk=await reader.read();
                if(chunk.done){if(await proc.exited!==0)throw fail("ambiguous");controller.close();cleanup();reader.releaseLock();}
                else controller.enqueue(chunk.value);
            }catch(error){controller.error(opts.init.signal?.aborted ? opts.init.signal.reason : fail("ambiguous",error));cleanup();try{await reader.cancel();}catch{/* Preserve stream failure. */}reader.releaseLock();}},
            async cancel(){cleanup();try{await reader.cancel();}finally{reader.releaseLock();}},
        });
        if([204,205,304].includes(header.status)){await stream.cancel();return new Response(null,{status:header.status,headers:header.headers});}
        return new Response(stream,{status:header.status,headers:header.headers});
    }catch(error){
        cleanup();try{await reader.cancel();}catch{/* Preserve framing failure. */}reader.releaseLock();
        opts.init.signal?.throwIfAborted();
        if(error && typeof error === 'object' && 'transportFailure' in error)throw error;
        throw fail(dispatched ? "ambiguous" : "before_dispatch",error);
    }
}
