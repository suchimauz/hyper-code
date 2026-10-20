/**
 * Resolve a compaction model to its cached upstream identity
 *
 * Use for context limits and native compactor selection. Hyper routes require one enabled cached catalogue entry with consistent provider/account identity and API. SSH routes require a configured instance and connected remote account registry entry. Never fetch credentials or infer an unknown node from its model spelling.
 * @param opts.model Direct provider/account:model, Hyper node or SSH instance model route.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Direct provider/account:model, Hyper node or SSH instance model route. */
        model: string;
    },
): Promise<{ provider: string; account: string; modelId: string; api?: string; relay: boolean } | null> {
    const m = /^([a-z][\w-]*)(?:\/([\w.-]+))?:(.+)$/.exec(opts.model);
    if (!m) return { provider: "", account: "default", modelId: opts.model, relay: false };
    if (m[1] === "ssh") {
        const route = /^(codex|claude-code)\/([A-Za-z0-9][A-Za-z0-9_-]{0,39}):([^:\s]+)$/.exec(m[3]!);
        if (!route || route[2] === "." || route[2] === "..") return null;
        const instance = m[2] ?? "default";
        const entries = await ctx.fns.sshAccount.registry({ action: "list" });
        if (!entries.some(e => e.instance === instance && e.provider === route[1] && e.account === route[2] && e.status === "connected")) return null;
        const host = await ctx.fns.sshInstance.get({ name: instance }).catch(() => null);
        if (!host?.pinnedHostKey) return null;
        return { provider: route[1]!, account: `ssh.${instance}.${route[2]}`, modelId: route[3]!, api: route[1] === "codex" ? "responses" : "anthropic", relay: true };
    }
    if (m[1] !== "hyper") return { provider: m[1]!, account: m[2] ?? "default", modelId: m[3]!, relay: false };
    const node = await ctx.fns.node.get({ name: m[2] ?? "default" });
    if (!node?.enabled || !node.catalog) return null;
    let matches = node.catalog.filter(e => e.id === m[3]);
    if (!matches.length && !m[3]!.includes(":")) matches = node.catalog.filter(e => e.id.slice(e.id.indexOf(":") + 1) === m[3]);
    if (matches.length !== 1) return null;
    const entry = matches[0]!;
    const identity = /^([a-z][\w-]*)\/([\w.-]+):(.+)$/.exec(entry.id);
    if (entry.id.includes(":") && (!identity || identity[1] !== entry.provider || identity[2] !== entry.account)) return null;
    if (entry.provider === "hyper") return null;
    if (entry.provider === "codex" && entry.api !== "responses") return null;
    return { provider: entry.provider, account: entry.account, modelId: identity?.[3] ?? entry.id, api: entry.api, relay: true };
}
