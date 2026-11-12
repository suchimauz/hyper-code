/**
 * Build a canonical `[ssh/<host>:]<provider>/<account>:<model>` model route from its parts.
 *
 * Inverse of llm.parseModelRoute. Always writes the account (defaulting to `default`), so every producer of model identifiers emits the same template. Pass an empty model to build an account prefix such as `codex/personal:` for prefix matching.
 * @param opts.provider Provider (access route) such as codex, claude-code, anthropic-oauth, opencode, lmstudio or mauzcode.
 * @param opts.account Credential slot, MauzCode node name for mauzcode, or default. @default default
 * @param opts.model Provider-native model ID; empty string yields the account prefix.
 * @param opts.host SSH instance name for remote execution; omit for local routes.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider (access route) such as codex, claude-code, anthropic-oauth, opencode, lmstudio or mauzcode. */
        provider: string;
        /** Credential slot, MauzCode node name for mauzcode, or default. @default default */
        account?: string;
        /** Provider-native model ID; empty string yields the account prefix. */
        model: string;
        /** SSH instance name for remote execution; omit for local routes. */
        host?: string | null;
    },
): string {
    const provider = String(opts.provider ?? "");
        const account = String(opts.account ?? "").trim() || "default";
        const model = String(opts.model ?? "");
        if (!/^[a-z][\w-]*$/.test(provider)) throw new Error("Invalid model provider");
        if (!/^[\w.-]+$/.test(account) || account === "." || account === "..") throw new Error("Invalid model account");
        if (opts.host != null && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(opts.host)) throw new Error("Invalid SSH host");
        return (opts.host ? "ssh/" + opts.host + ":" : "") + provider + "/" + account + ":" + model;
}
