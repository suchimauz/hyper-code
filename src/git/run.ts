async function readAll(stream?: ReadableStream<Uint8Array> | null): Promise<string> {
    if (!stream) return "";
    return await new Response(stream).text();
}

/**
 * Runs a git command in the agent workspace, locally or on the workspace's SSH host.
 *
 * Follows the same rule as the file tools (workspace.target): no host → the
 * agent workspace (remote when it has a host); host "local" → this machine; any
 * other alias → that host. dir overrides the working directory; relative dirs
 * resolve against the workspace dir on the workspace host. Arguments are passed
 * as quoted shell words remotely, argv locally.
 * @param opts.args git arguments, without the leading "git".
 * @param opts.dir Working directory; defaults to the workspace directory.
 * @param opts.host SSH host alias, or "local"; omitted means the agent workspace.
 * @param opts.allowFailure Return a failed result instead of throwing. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** git arguments, without the leading "git". */
        args: string[];
        /** Working directory; defaults to the workspace directory. */
        dir?: string;
        /** SSH host alias, or "local"; omitted means the agent workspace. */
        host?: string;
        /** Return a failed result instead of throwing. @default false */
        allowFailure?: boolean;
        /** Kill the command after this many seconds; omitted preserves the existing local behavior. @minimum 0.1 @maximum 300 */
        timeout?: number;
        /** Maximum output bytes per local stream or characters per remote stream; overflow fails rather than returning partial success. @minimum 1024 @maximum 10485760 */
        maxOutput?: number;
    },
): Promise<types.git.Result> {
    const args = opts.args;
    if (opts.timeout !== undefined && (!Number.isFinite(opts.timeout) || opts.timeout < 0.1 || opts.timeout > 300)) throw new Error('Invalid git timeout');
    if (opts.maxOutput !== undefined && (!Number.isInteger(opts.maxOutput) || opts.maxOutput < 1024 || opts.maxOutput > 10485760)) throw new Error('Invalid git output limit');
    // Local is the common case and needs nothing but the session: only a remote
    // workspace or an explicit host goes through workspace.target.
    const remote = (opts.host && opts.host !== "local") || (!opts.host && session?.agent?.workspaceHost);
    const at = remote
        ? ctx.fns.workspace.target({ host: opts.host, path: opts.dir })
        : { host: null, path: opts.dir ?? (opts.host === "local" && session?.agent?.workspaceHost ? process.cwd() : session?.agent?.workspaceDir ?? process.cwd()) };
    let out: types.git.Result;
    if (at.host) {
        const q = (s: string) => ctx.fns.remote.quote({ value: s });
        // GIT_TERMINAL_PROMPT=0: a credential prompt would hang a non-interactive session.
        const r = await ctx.fns.remote.exec({ host: at.host, cwd: at.path, command: "GIT_TERMINAL_PROMPT=0 git " + args.map(q).join(" "), timeout: opts.timeout ?? 300, ...(opts.maxOutput === undefined ? {} : {maxOutput: opts.maxOutput}) });
        const overflow = opts.maxOutput !== undefined && (r.stdout.length >= opts.maxOutput || r.stderr.length >= opts.maxOutput);
        out = { ok: r.exitCode === 0 && !r.timedOut && !overflow, code: overflow ? -1 : r.exitCode ?? -1, stdout: overflow ? '' : r.stdout, stderr: overflow ? 'Git output limit exceeded' : r.timedOut ? `git timed out on ${at.host}\n${r.stderr}` : r.stderr };
    } else {
        const proc = Bun.spawn(["git", ...args], {
            cwd: at.path,
            ...(opts.timeout !== undefined || opts.maxOutput !== undefined ? {detached: process.platform !== 'win32'} : {}),
            stdout: "pipe",
            stderr: "pipe",
        });
        let failure = '';
        const kill = () => {
            if (process.platform !== 'win32') {
                try { process.kill(-proc.pid, 'SIGKILL'); }
                catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') proc.kill('SIGKILL'); }
            } else proc.kill('SIGKILL');
        };
        const timer = opts.timeout === undefined ? undefined : setTimeout(() => { failure = 'Git command timed out'; kill(); }, opts.timeout * 1000);
        const bounded = async (stream: ReadableStream<Uint8Array>) => {
            if (opts.maxOutput === undefined) return readAll(stream);
            const reader = stream.getReader(), chunks: Uint8Array[] = [];
            let size = 0;
            while (true) {
                const part = await reader.read();
                if (part.done) break;
                size += part.value.length;
                if (size > opts.maxOutput) { failure = 'Git output limit exceeded'; kill(); await reader.cancel(); break; }
                chunks.push(part.value);
            }
            return Buffer.concat(chunks).toString('utf8');
        };
        try {
            const [stdout, stderr, code] = await Promise.all([bounded(proc.stdout), bounded(proc.stderr), proc.exited]);
            out = { ok: code === 0 && !failure, code: failure ? -1 : code, stdout: failure ? '' : stdout, stderr: failure || stderr };
        } finally { if (timer) clearTimeout(timer); }
    }
    if (!out.ok && !opts.allowFailure) throw new Error(out.stderr || out.stdout || `git exited with code ${out.code}`);
    return out;
}
