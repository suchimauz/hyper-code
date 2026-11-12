/**
 * Send an allow-listed Claude subscription request through its connection transport.
 *
 * Use for Claude inference, OAuth token exchange and usage requests; reject unsupported destinations before any transport call.
 * @param opts.conn Resolved connection supplying the only permitted network transport.
 * @param opts.url Exact HTTPS Claude subscription endpoint.
 * @param opts.init HTTP method, headers, body and cancellation signal.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved connection supplying the only permitted network transport. */
        conn: types.models.ResolvedConnection;
        /** Exact HTTPS Claude subscription endpoint. */
        url: string;
        /** HTTP method, headers, body and cancellation signal. */
        init: RequestInit;
    },
): Promise<Response> {
    const base = (ctx.env.CLAUDE_CODE_BASE_API_URL || "https://api.anthropic.com").replace(/\/+$/, "");
    const token = ctx.fns.llm.anthropicOAuthConstants({}).tokenUrl;
    const destinations: Record<string, string> = { [base + "/v1/messages"]: "POST", [base + "/v1/messages/count_tokens"]: "POST", [base + "/api/oauth/usage"]: "GET", [base + "/api/oauth/profile"]: "GET", [token]: "POST" };
    if (!opts.url.startsWith("https://") || destinations[opts.url] !== (opts.init.method ?? "GET").toUpperCase()) throw Object.assign(new Error("PROXY_CONFIG: Claude endpoint is not allowed"), { code: "PROXY_CONFIG", retryable: false, requestSent: false });
    return opts.conn.fetch(opts.url, { ...opts.init, redirect: "error" });
}
