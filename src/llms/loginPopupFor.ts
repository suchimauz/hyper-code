// Popup RPC entrypoint used by the typed +Claude/+Codex buttons.
/** Returns the safe popup content for starting one official provider login. */
/**
 * Build the typed account-login popup for Claude Code or Codex.
 *
 * The form posts to the provider-specific login route. It explains where the
 * credential will live and explicitly guarantees that no access/refresh token
 * is returned through the popup RPC.
 *
 * @param opts.provider Provider login type.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Provider to authenticate. */ provider: "claude-code" | "codex" | "xai" | "kimi-coding";
    /** Existing account slot to reconnect. */ account?: string;
    /** Fixed configured SSH instance for a remote reconnect; omitted keeps reconnect local. */ instance?: string;
}): Promise<string> {
    const provider = opts.provider;
    if (provider !== "claude-code" && provider !== "codex" && provider !== "xai" && provider !== "kimi-coding") throw new Error("unsupported provider");
    if (opts.instance && provider === "xai") throw new Error("Grok does not support SSH account login");
    const instances = !opts.account && provider !== "xai" ? await ctx.fns.sshInstance.list({}) : [];
    return ctx.fns.ui.popupContent({
        title: opts.account ? `Reconnect ${opts.account}` : provider === "claude-code" ? "Add Claude Code account" : provider === "xai" ? "Add Grok account" : provider === "kimi-coding" ? "Add Kimi Coding account" : "Add Codex account",
        kind: "login",
        html: ctx.fns.llms.loginPopup({ provider, flow: null, account: opts.account, instance: opts.instance, instances }),
    });
}
