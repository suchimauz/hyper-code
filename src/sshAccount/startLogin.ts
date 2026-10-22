/**
 * Start official CLI authorization inside an isolated remote HOME
 *
 * Launch a trusted SSH instance CLI with private remote credential storage, bounded public progress hints and strict shell-owned phase markers. Keep only timestamps, exit codes and allowlisted error classifications; never retain CLI logs. Credentials never leave the remote host. Login expires after ten minutes.
 * @param opts.instance Trusted configured SSH instance name.
 * @param opts.provider Installed official CLI to authorize.
 * @param opts.account Account slot: up to forty ASCII letters, digits, underscores or hyphens, starting with a letter or digit.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Trusted configured SSH instance name. */
        instance: string;
        /** Installed official CLI to authorize. */
        provider: "codex" | "claude-code";
        /** Account slot: up to forty ASCII letters, digits, underscores or hyphens, starting with a letter or digit. */
        account: string;
    },
): Promise<{id:string}> {
    await ctx.fns.sshAccount.requireOwner({});
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(opts.account) || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(opts.instance) || !['codex','claude-code'].includes(opts.provider)) throw new Error('Invalid remote account');
    const connection = await ctx.fns.sshInstance.connection({name:opts.instance});
    const state = ctx.state.sshAccount ??= {};
    const flows = state.flows ??= new Map();
    for (const previous of flows.values()) if (previous.instance===opts.instance && previous.provider===opts.provider && previous.account===opts.account && previous.status==='pending') throw new Error('Authorization already running');
    for (const [key,value] of flows) if (value.expiresAt < Date.now() - 600000) flows.delete(key);
    const id = crypto.randomUUID();
    const flow: types.sshAccount.LoginFlow = {id,...opts,status:'pending',verificationUri:null,userCode:null,error:null,expiresAt:Date.now()+600000,process:null};
    const diagnostics = flow.diagnostics = {startedAt:Date.now(),endedAt:null,exitCode:null,reason:null,httpCode:null,stages:[{phase:'ssh-preflight',startedAt:Date.now(),endedAt:null,exitCode:null}]} as NonNullable<types.sshAccount.LoginFlow['diagnostics']>;
    // The shell owns stdout; CLI output is routed exclusively to stderr. A per-flow
    // marker and exact grammar prevent provider output from becoming diagnostics.
    const marker = 'HYPER_LOGIN_' + crypto.randomUUID().replaceAll('-','');
    const cli = opts.provider === 'codex' ? 'codex' : 'claude';
    const root = '.hyper/ssh-accounts/' + opts.provider + '/' + opts.account;
    const script = [
     'set -eu', 'umask 077',
     `stage() { printf '${marker}:%s:%s\\n' "$1" "$2"; }`,
     `finish() { rc=$?; stage exit "$rc"; }; trap finish EXIT`,
     'PATH="$HOME/.bun/bin:$HOME/.local/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"', 'cli=$(command -v '+cli+')',
     'root="$HOME/'+root+'"',
     'for p in "$HOME/.hyper" "$HOME/.hyper/ssh-accounts" "$HOME/.hyper/ssh-accounts/'+opts.provider+'" "$root" "$root/.codex" "$root/.claude" "$root/no-browser" "$root/.codex/auth.json" "$root/.claude/.credentials.json"; do test ! -L "$p" || exit 1; done',
     'mkdir -p "$root/.codex" "$root/.claude"',
     'chmod 700 "$root" "$root/.codex" "$root/.claude"',
     'helper="$root/no-browser"',
     "printf '#!/bin/sh\\nexit 0\\n' > \"$helper\"", 'chmod 700 "$helper"',
     'export HOME="$root" CODEX_HOME="$root/.codex" CLAUDE_CONFIG_DIR="$root/.claude"',
     'run_cli() { env -i HOME="$HOME" CODEX_HOME="$CODEX_HOME" CLAUDE_CONFIG_DIR="$CLAUDE_CONFIG_DIR" PATH="$PATH" TERM=dumb BROWSER="$helper" "$cli" "$@"; }',
     'stage cli-login 0',
     opts.provider==='codex' ? 'run_cli login --device-auth >&2' : 'run_cli auth login --claudeai >&2',
     'stage credential-check 0',
     opts.provider==='codex' ? 'test -s "$CODEX_HOME/auth.json"' : 'test -s "$CLAUDE_CONFIG_DIR/.credentials.json"',
     'stage login-status 0',
     opts.provider==='codex' ? 'run_cli login status >&2' : 'run_cli auth status >&2'
    ].join('\n');
    const quote = (s:string) => "'"+s.replaceAll("'", "'\\''")+"'";
    flows.set(id,flow);
    try {
        await ctx.fns.sshAccount.registry({action:'begin',...opts});
        flow.process = Bun.spawn([connection.bin,...connection.args,connection.host,'sh -c '+quote(script)],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
    } catch {
        flows.delete(id);
        await ctx.fns.sshAccount.registry({action:'fail',...opts});
        throw new Error('Remote authorization could not start');
    }
    let tail='';
    const finishDiagnostics = (exit: number | null) => {
        diagnostics.endedAt ??= Date.now(); diagnostics.exitCode = exit;
        const stage = diagnostics.stages.at(-1)!;
        stage.endedAt ??= diagnostics.endedAt; stage.exitCode ??= exit;
        if (flow.status === 'failed' && !diagnostics.reason) diagnostics.reason = stage.phase === 'credential-check' ? 'missing-credentials' : 'cli-exit';
        if(flow.status==='failed' && stage.phase==='credential-check') {diagnostics.reason='missing-credentials';diagnostics.httpCode=null;}
    };
    const consumeProtocol = async (stream:ReadableStream<Uint8Array>) => {
        const reader=stream.getReader(); const decoder=new TextDecoder(); let line=''; let overflow=false;
        try { while(true) { const part=await reader.read(); if(part.done)break;
            for(const char of decoder.decode(part.value,{stream:true})) {
                if(char !== '\n') { if(line.length < 160 && !overflow)line+=char; else {overflow=true;line='';} continue; }
                const match = !overflow && line.match(new RegExp('^'+marker+':(cli-login|credential-check|login-status|exit):([0-9]{1,3})$'));
                line='';overflow=false;
                if(!match || Number(match[2])>255 || diagnostics.endedAt!==null)continue;
                const current=diagnostics.stages.at(-1)!;
                if(match[1]==='exit') { current.exitCode=Number(match[2]); continue; }
                const expected=['ssh-preflight','cli-login','credential-check','login-status'][diagnostics.stages.length];
                if(match[1]!==expected || match[2]!=='0')continue;
                current.endedAt=Date.now();current.exitCode=0;
                diagnostics.stages.push({phase:match[1] as typeof current.phase,startedAt:Date.now(),endedAt:null,exitCode:null});
            }
        }} finally {reader.releaseLock();}
    };
    const consume = async (stream:ReadableStream<Uint8Array>) => { const reader=stream.getReader();const decoder=new TextDecoder();try {while(true){const part=await reader.read();if(part.done)break;tail=(tail+decoder.decode(part.value,{stream:true}).replace(/\x1b\[[0-9;]*[A-Za-z]/g,'')).slice(-8192); for(const candidate of tail.match(/https:\/\/[^\s<>"']+/g)??[]){try{const u=new URL(candidate);const allowed=opts.provider==='codex'?['auth.openai.com']:['claude.ai','platform.claude.com','console.anthropic.com'];if(allowed.includes(u.hostname)&&u.protocol==='https:'&&!u.username&&!u.password&&u.port==='') flow.verificationUri=u.href; }catch{ /* Invalid URL candidates are ignored. */ }} if (flow.status==='pending') { if (/certificate|CERT_HAS_EXPIRED|SSL|TLS/i.test(tail)) diagnostics.reason='tls';
                else if (/permission denied|EACCES|EPERM/i.test(tail)) diagnostics.reason='permission';
                else if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|could not resolve|connection (?:refused|timed out|reset)/i.test(tail)) diagnostics.reason='network';
                else {const http=tail.match(/\bHTTP(?:\/\d(?:\.\d)?)?\s+([45]\d{2})\b/i);if(http){diagnostics.reason='http';diagnostics.httpCode=Number(http[1]);}} }
                const code=tail.match(/\b[A-Z0-9]{4,5}-[A-Z0-9]{4,5}\b/);if(code) flow.userCode=code[0];}}finally{reader.releaseLock();}};
    const process=flow.process;
    const timer=setTimeout(()=>{if(flow.status==='pending'){flow.status='failed';flow.error='Authorization timed out';diagnostics.reason='timeout';finishDiagnostics(null);process.kill();}},600000);
    void (async()=>{try {const [exit]=await Promise.all([process.exited,consumeProtocol(process.stdout),consume(process.stderr)]);if(flow.status==='pending'){const verified=exit===0&&diagnostics.stages.length===4;flow.status=verified?'connected':'failed';flow.error=verified?null:'Remote CLI authorization failed; retry login.';}if(flow.status==='connected'){diagnostics.reason=null;diagnostics.httpCode=null;}finishDiagnostics(exit);await ctx.fns.sshAccount.registry({action:flow.status==='connected'?'connect':'fail',...opts});if(flow.status==='connected'){const catalog=(ctx.state as typeof ctx.state & {llmModelCatalog?:Record<string,{at:number}>}).llmModelCatalog;for(const item of Object.values(catalog??{}))item.at=0;}ctx.fns.procs.events.refresh({topic:'ssh-accounts'});ctx.fns.procs.events.refresh({topic:'llm-accounts'});}catch{process.kill();flow.status='failed';flow.error='Remote authorization interrupted';diagnostics.reason='interrupted';finishDiagnostics(null);await ctx.fns.sshAccount.registry({action:'fail',...opts});}finally{clearTimeout(timer);flow.process=null;tail='';}})().catch(()=>{flow.status='failed';flow.error='Unable to save authorization status';diagnostics.reason='interrupted';finishDiagnostics(null);});
    return {id};
}
