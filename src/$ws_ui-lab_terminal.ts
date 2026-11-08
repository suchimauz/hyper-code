// Owner-only interactive shell for the UI Lab Canvas Terminal tab. One socket owns
// exactly one PTY in the agent's local workspace; closing the socket kills it, and
// the process exiting closes the socket. Protocol (client → server JSON text):
//   {"type":"input","data":"…"}   {"type":"resize","cols":N,"rows":N}
// Server → client: binary frames carry raw PTY output; text frames are JSON
//   {"type":"ready","cwd"}  {"type":"exit","code"}
const MAX_SESSIONS = 4;
const MAX_MESSAGE = 64 * 1024;
const MAX_BUFFERED = 1024 * 1024;
const IDLE_MS = 12 * 60 * 60 * 1000;
// Survives hot reload of this module, so the session cap cannot be bypassed by reloading.
const live: Set<Term> = ((globalThis as any).__hyperUiTerminals ??= new Set<Term>());

type Start = {agentId: string; cwd: string; cols: number; rows: number};
type Term = Start & {proc?: ReturnType<typeof Bun.spawn>; closed: boolean; idle?: ReturnType<typeof setTimeout>};

function kill(term: Term) {
    if (term.closed) return;
    term.closed = true;
    clearTimeout(term.idle);
    live.delete(term);
    const proc = term.proc as any;
    try { proc?.terminal?.close(); } catch { /* already closed */ }
    try { proc?.kill('SIGHUP'); } catch { /* already exited */ }
    // A shell ignoring SIGHUP is stopped for good shortly after.
    if (proc) setTimeout(() => { try { if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL'); } catch { /* exited */ } }, 2000);
}

export default {
    async upgrade(ctx: Context, _session: Session | null, opts: {req: Request}) {
        const start = await ctx.fns.frontendBridge.authorizeTerminal({req: opts.req});
        if (start instanceof Response) return start;
        if (live.size >= MAX_SESSIONS) return new Response(`At most ${MAX_SESSIONS} terminals at once`, {status: 429});
        const term: Term = {...start, closed: false};
        live.add(term); // reserved now, so parallel handshakes respect the cap
        return term;
    },
    open(_ctx: Context, _session: Session | null, {ws}: {ws: any}) {
        const term: Term = ws.data.state;
        if (term.closed) { ws.close(1011, 'Terminal closed'); return; }
        const touch = () => { clearTimeout(term.idle); term.idle = setTimeout(() => { kill(term); ws.close(1000, 'Idle timeout'); }, IDLE_MS); };
        const shell = process.env.SHELL && process.env.SHELL.startsWith('/') ? process.env.SHELL : '/bin/bash';
        try {
            term.proc = Bun.spawn([shell, '-i'], {
                cwd: term.cwd,
                env: {...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'hyper-ui'},
                terminal: {
                    cols: term.cols, rows: term.rows,
                    data(_t: unknown, bytes: Uint8Array) {
                        if (term.closed) return;
                        // A client that stops reading must not grow server memory without bound.
                        if (ws.getBufferedAmount() + bytes.byteLength > MAX_BUFFERED) { kill(term); ws.close(1013, 'Terminal output backlog'); return; }
                        ws.send(bytes);
                    },
                },
            } as any);
        } catch (error) {
            kill(term);
            ws.close(1011, ('Shell failed: ' + (error instanceof Error ? error.message : String(error))).slice(0, 120));
            return;
        }
        const proc = term.proc;
        void proc.exited.then(code => {
            if (term.closed) return;
            kill(term);
            try { ws.send(JSON.stringify({type: 'exit', code})); ws.close(1000, 'Shell exited'); } catch { /* socket gone */ }
        });
        ws.send(JSON.stringify({type: 'ready', cwd: term.cwd}));
        touch();
        (term as any).touch = touch;
    },
    message(_ctx: Context, _session: Session | null, {ws, message}: {ws: any; message: string | Buffer}) {
        const term: Term = ws.data.state;
        if (term.closed || !term.proc) return;
        if (typeof message !== 'string' || Buffer.byteLength(message) > MAX_MESSAGE) { kill(term); ws.close(1009, 'Message too large or binary'); return; }
        let msg: any;
        try { msg = JSON.parse(message); } catch { ws.close(1003, 'JSON required'); kill(term); return; }
        const t = (term.proc as any).terminal;
        (term as any).touch?.();
        if (msg?.type === 'input' && typeof msg.data === 'string') t.write(msg.data);
        else if (msg?.type === 'resize' && Number.isInteger(msg.cols) && Number.isInteger(msg.rows) && msg.cols >= 2 && msg.cols <= 500 && msg.rows >= 2 && msg.rows <= 200) t.resize(msg.cols, msg.rows);
        else { ws.close(1003, 'Unknown message'); kill(term); }
    },
    close(_ctx: Context, _session: Session | null, {ws}: {ws: any}) {
        kill(ws.data.state as Term);
    },
};
