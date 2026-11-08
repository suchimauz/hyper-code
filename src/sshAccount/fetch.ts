/**
 * Stream subscription HTTP exclusively through pinned SSH SOCKS
 *
 * Uses shared pinned SOCKS HTTPS for every owner-bound provider account. OAuth requires secure encrypted onboarding; coding plans and OpenCode use SOCKS by default with caller authorization. Missing OAuth, suspended and recovery records fail explicitly, never through a remote Python or direct HTTP fallback.
 * Active worker-bound cron grants may use only their exact OpenCode Go DeepSeek descriptor, body model and fixed endpoint. The live task, run, owner, grant and authority version are checked before dispatch; no SSH management capability is returned.
 * @param opts.ssh Pinned SSH instance and isolated subscription account identity.
 * @param opts.url Allowlisted HTTPS inference, model catalogue or quota URL for the selected provider.
 * @param opts.init HTTP payload and cancellation signal; authorization is injected by the bound provider adapter.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Pinned SSH instance and isolated subscription account identity. */
        ssh: { instance:string; provider:"codex"|"claude-code"|"kimi-coding"|"zai-coding"|"minimax-coding"|"opencode"; account:string };
        /** Allowlisted HTTPS inference, model catalogue or quota URL for the selected provider. */
        url: string;
        /** HTTP payload and cancellation signal; authorization is injected by the bound provider adapter. */
        init: {method?:string;headers?:Record<string,string>;body?:string;signal?:AbortSignal};
    },
): Promise<Response> {
    return ctx.fns.sshProvider.dispatch(opts);
}
