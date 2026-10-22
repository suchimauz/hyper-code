// Form RPC target: starts the real provider login and immediately replaces the
// popup body with safe progress (URL/code for Codex, browser instruction for
// Claude). No credential crosses this RPC boundary.
/** Starts a typed subscription login and returns its safe progress popup. */
/**
 * Start an official Claude Code, Codex or Kimi Coding account login from the popup form.
 *
 * Returns only account name, status, verification URL and device code. Access
 * and refresh tokens remain exclusively in the provider-owned credential store.
 * Kimi Coding runs only its OAuth device flow — locally or, when an instance is
 * chosen, from this machine with the granted credential written on the host;
 * no Kimi CLI is ever executed.
 *
 * @param opts.provider Provider login type.
 * @param opts.account New account slot name.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Provider to authenticate. */ provider: "claude-code" | "codex" | "xai" | "kimi-coding";
    /** Account slot name. */ account: string;
    /** SSH instance to authorize on; omitted or empty starts local login. */ instance?: string;
}): Promise<string> {
    const provider = opts.provider;
    if (provider !== "claude-code" && provider !== "codex" && provider !== "xai" && provider !== "kimi-coding") throw new Error("unsupported provider");
    if (opts.instance) {
        if (provider === "xai") throw new Error("Grok does not support SSH account login");
        // Kimi authorizes here and ships the credential to the host, so no CLI runs remotely.
        const flow = provider === "kimi-coding"
            ? await ctx.fns.sshAccount.startKimiLogin({ instance: opts.instance, account: opts.account })
            : await ctx.fns.sshAccount.startLogin({ instance: opts.instance, provider: provider as "codex" | "claude-code", account: opts.account });
        return ctx.fns.sshAccount.progressPopup({ id: flow.id });
    }
    if (provider === "kimi-coding") await ctx.fns.sshAccount.startKimiLogin({ account: opts.account });
    else if (provider === "xai") await ctx.fns.llm.startXaiOAuth({ account: opts.account });
    else await ctx.fns.llm.startAccountLogin({ provider: provider as "codex" | "claude-code", account: opts.account });
    const flow = [...ctx.fns.llm.accountLoginStatus({})].reverse().find((f: any) => f.provider === provider && f.account === opts.account) ?? null;
    return ctx.fns.ui.popupContent({
        title: provider === "claude-code" ? "Claude Code login" : provider === "xai" ? "Grok device login" : provider === "kimi-coding" ? "Kimi Coding login" : "Codex login",
        kind: "login-progress",
        html: ctx.fns.llms.loginPopup({ provider, flow }),
    });
}
