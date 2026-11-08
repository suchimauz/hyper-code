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
    return ctx.fns.codexTunnel.dispatch({request:opts});
}
