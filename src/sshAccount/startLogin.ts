/**
 * Start official CLI authorization inside an isolated remote HOME
 *
 * Launch a trusted SSH instance CLI with private remote credential storage and bounded public progress hints. Credentials never leave the remote host. Login expires after ten minutes.
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
    const cli = opts.provider === 'codex' ? 'codex' : 'claude';
    const root = '.hyper/ssh-accounts/' + opts.provider + '/' + opts.account;
    const script = [
     'set -eu', 'umask 077',
     'PATH="$HOME/.bun/bin:$HOME/.local/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"', 'cli=$(command -v '+cli+')',
     'root="$HOME/'+root+'"',
     'for p in "$HOME/.hyper" "$HOME/.hyper/ssh-accounts" "$HOME/.hyper/ssh-accounts/'+opts.provider+'" "$root" "$root/.codex" "$root/.claude" "$root/no-browser" "$root/.codex/auth.json" "$root/.claude/.credentials.json"; do test ! -L "$p" || exit 1; done',
     'mkdir -p "$root/.codex" "$root/.claude"',
     'chmod 700 "$root" "$root/.codex" "$root/.claude"',
     'helper="$root/no-browser"',
     "printf '#!/bin/sh\\nexit 0\\n' > \"$helper\"", 'chmod 700 "$helper"',
     'export HOME="$root" CODEX_HOME="$root/.codex" CLAUDE_CONFIG_DIR="$root/.claude"',
     'run_cli() { env -i HOME="$HOME" CODEX_HOME="$CODEX_HOME" CLAUDE_CONFIG_DIR="$CLAUDE_CONFIG_DIR" PATH="$PATH" TERM=dumb BROWSER="$helper" "$cli" "$@"; }',
     opts.provider==='codex' ? 'run_cli login --device-auth >&2 && run_cli login status >/dev/null 2>&1 && test -s "$CODEX_HOME/auth.json"' : 'run_cli auth login --claudeai >&2 && run_cli auth status >/dev/null 2>&1 && test -s "$CLAUDE_CONFIG_DIR/.credentials.json"'
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
    const consume = async (stream:ReadableStream<Uint8Array>) => { const reader=stream.getReader();const decoder=new TextDecoder();try {while(true){const part=await reader.read();if(part.done)break;tail=(tail+decoder.decode(part.value,{stream:true}).replace(/\x1b\[[0-9;]*[A-Za-z]/g,'')).slice(-8192); for(const candidate of tail.match(/https:\/\/[^\s<>"']+/g)??[]){try{const u=new URL(candidate);const allowed=opts.provider==='codex'?['auth.openai.com']:['claude.ai','platform.claude.com','console.anthropic.com'];if(allowed.includes(u.hostname)&&u.protocol==='https:'&&!u.username&&!u.password&&u.port==='') flow.verificationUri=u.href;}catch{ /* Invalid URL candidates are ignored. */ }} const code=tail.match(/\b[A-Z0-9]{4,5}-[A-Z0-9]{4,5}\b/);if(code) flow.userCode=code[0];}}finally{reader.releaseLock();}};
    const process=flow.process;
    const timer=setTimeout(()=>{if(flow.status==='pending'){flow.status='failed';flow.error='Authorization timed out';process.kill();}},600000);
    void (async()=>{try {const [exit]=await Promise.all([process.exited,consume(process.stdout),consume(process.stderr)]);if(flow.status==='pending'){flow.status=exit===0?'connected':'failed';flow.error=exit===0?null:'Remote CLI authorization failed; retry login.';}await ctx.fns.sshAccount.registry({action:flow.status==='connected'?'connect':'fail',...opts});if(flow.status==='connected'){const catalog=(ctx.state as typeof ctx.state & {llmModelCatalog?:Record<string,{at:number}>}).llmModelCatalog;for(const item of Object.values(catalog??{}))item.at=0;}ctx.fns.procs.events.refresh({topic:'ssh-accounts'});ctx.fns.procs.events.refresh({topic:'llm-accounts'});}catch{flow.status='failed';flow.error='Remote authorization interrupted';await ctx.fns.sshAccount.registry({action:'fail',...opts});}finally{clearTimeout(timer);flow.process=null;tail='';}})().catch(()=>{flow.status='failed';flow.error='Unable to save authorization status';});
    return {id};
}
