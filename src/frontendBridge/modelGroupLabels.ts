/**
 * Build SOCKS5 Claude account group labels for model selectors without changing model routes
 *
 * Use when projecting authenticated existing-chat or new-chat model choices. Reads secret-free local OAuth proxy bindings once per account; leaves direct, SSH and node routes without an override.
 * @param opts.models Full runtime model routes to annotate; only local anthropic-oauth routes have proxy group overrides.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Full runtime model routes to annotate; only local anthropic-oauth routes have proxy group overrides. */
        models: string[];
    },
): Promise<Record<string, string>> {
    const accounts = new Map<string, Promise<string | null>>();
    const labels: Record<string, string> = {};
    await Promise.all(opts.models.map(async model => {
        const match = /^anthropic-oauth(?:\/([^:]+))?:/.exec(model);
        if (!match) return;
        const account = match[1] || "default";
        let pending = accounts.get(account);
        if (!pending) {
            pending = ctx.fns.llm.accountProxy({provider:"anthropic-oauth",account}).then(proxy =>
                proxy ? `socks5 · ${proxy.name || `${proxy.host}:${proxy.port}`} · claude/${account}` : null);
            accounts.set(account, pending);
        }
        const label = await pending;
        if (label) labels[model] = label;
    }));
    return labels;
}
