/**
 * Explicitly connects to a pinned SSH host to detect remote CLI availability
 *
 * Invoke only after the owner requests a connectivity test. Uses a bounded fifteen-second OpenSSH command and reports only python3, codex and claude availability, never credentials.
 * @param opts.name Trusted configured SSH instance name.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Trusted configured SSH instance name. */
        name: string;
    },
): Promise<{python3:boolean;codex:boolean;claude:boolean}> {
    await ctx.fns.sshInstance.authorize({}); const {bin,args,host}=await ctx.fns.sshInstance.connection(opts);
    const script='PATH="$HOME/.bun/bin:$HOME/.local/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"; export PATH; for c in python3 codex claude; do if command -v "$c" >/dev/null 2>&1; then printf "%s=yes\\n" "$c"; fi; done';
    const proc=Bun.spawn([bin,...args,host,script],{stdout:'pipe',stderr:'ignore'}); const timer=setTimeout(()=>proc.kill(),15000);
    try { const reader=proc.stdout.getReader(); let text=''; while(true){const r=await reader.read();if(r.done)break;text+=new TextDecoder().decode(r.value);if(text.length>4096){proc.kill();throw new Error('Unexpected probe output');}} if(await proc.exited!==0)throw new Error('SSH probe failed'); return {python3:text.includes('python3=yes'),codex:text.includes('codex=yes'),claude:text.includes('claude=yes')}; }finally{clearTimeout(timer);}
}
