/**
 * Resolve the Claude CLI version on the selected local or pinned SSH instance.
 * Use for subscription user-agent identity. CLAUDE_CODE_CLI_VERSION explicitly
 * overrides detection for ALL destinations. Otherwise cache successful detection
 * for five minutes (failures for 30 seconds), deduplicating concurrent probes.
 * SSH probes use the remote HOME/.local/bin PATH and require remote `timeout`;
 * they never read credentials or substitute the local CLI for a remote failure.
 * Failed, malformed or timed-out probes use the known compatibility fallback
 * 2.1.260, not a claim about the installed CLI. Output is capped at 4 KiB and
 * subprocesses have a 12-second local deadline (8 seconds on the remote host).
 * @param opts.instance Exact configured SSH instance name; omitted detects locally.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact configured SSH instance name; omitted detects the local CLI. */
        instance?: string;
    },
): Promise<string> {
    const explicit = String(ctx.env.CLAUDE_CODE_CLI_VERSION ?? "").trim();
    if (explicit) return explicit;
    const fallback = "2.1.260";
    const state = ((ctx.state as any).llm ??= {});
    const cache: Map<string, { fingerprint: string; expires: number; value?: string; pending?: Promise<string> }> = state.claudeCliVersions ??= new Map();
    const key = opts.instance === undefined ? "local" : `ssh:${opts.instance}`;
    const home = ctx.env.HOME ?? process.env.HOME ?? "";
    const path = [`${home}/.local/bin`, "/opt/homebrew/bin", "/usr/local/bin", ctx.env.PATH ?? process.env.PATH ?? ""].filter(Boolean).join(":");
    let fingerprint: string;
    try {
        // Secret-free descriptor only: changes of destination, identity or pin
        // invalidate both positive and negative results without an SSH roundtrip.
        fingerprint = opts.instance === undefined ? path : JSON.stringify(await ctx.fns.sshInstance.get({ name: opts.instance }));
    } catch {
        // An unavailable/untrusted instance must never trigger local detection.
        return fallback;
    }
    const prior = cache.get(key);
    if (prior?.fingerprint === fingerprint) {
        if (prior.pending) return prior.pending;
        if (prior.expires > Date.now()) return prior.value!;
    }
    const entry: { fingerprint: string; expires: number; value?: string; pending?: Promise<string> } = { fingerprint, expires: 0 };
    cache.set(key, entry);
    entry.pending = (async () => {
        let version: string | undefined;
        try {
            const connection = opts.instance === undefined ? undefined : await ctx.fns.sshInstance.connection({ name: opts.instance });
            const command = 'export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"; exec timeout -k 1s 8s claude --version';
            const argv = connection ? [connection.bin, ...connection.args, connection.host, command] : ["claude", "--version"];
            const proc = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "ignore", env: { ...process.env, ...ctx.env, PATH: path } });
            let expired = false;
            const timer = setTimeout(() => { expired = true; proc.kill("SIGKILL"); }, 12_000);
            const reader = proc.stdout.getReader();
            try {
                let output = "";
                let bytes = 0;
                const decoder = new TextDecoder();
                while (true) {
                    const chunk = await reader.read();
                    if (chunk.done) break;
                    bytes += chunk.value.byteLength;
                    if (bytes > 4096) throw new Error("CLI version output limit exceeded");
                    output += decoder.decode(chunk.value, { stream: true });
                }
                output += decoder.decode();
                if (await proc.exited === 0 && !expired) version = output.trim().match(/^(\d+\.\d+\.\d+)(?:\s+\(Claude Code\))?$/)?.[1];
            } finally {
                clearTimeout(timer);
                proc.kill("SIGKILL");
                await reader.cancel().catch(() => undefined);
                await proc.exited;
            }
        } catch {
            // Detection is best effort; do not break inference or reuse a local version.
            version = undefined;
        }
        entry.value = version ?? fallback;
        entry.expires = Date.now() + (version ? 300_000 : 30_000);
        entry.pending = undefined;
        return entry.value;
    })();
    return entry.pending;
}
