// Which credentials exist, and how much quota each has left.
//
// This is what makes "switch account" a real choice rather than a guess: a
// second ChatGPT or Claude login is only useful if you can see that it still
// has room while the current one is spent.
/** Lists every configured subscription credential with its remaining quota. */
/**
 * Enumerate the credential accounts available per subscription provider.
 *
 * Combines file-backed logins (~/.codex/auth.json and its named siblings,
 * ~/.kimi/credentials), managed OAuth rows, secret-free SSH account metadata,
 * and recorded quota snapshots. SSH rows use the normal provider and synthetic
 * ssh.<instance>.<account> quota identity, without reading remote credentials.
 * Marks which accounts are currently exhausted. Use it to render an account
 * switcher or to pick a fallback credential.
 *
 * @param opts.provider Restrict the listing to one provider.
 * @param opts.now Current time in ms, for testing.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts?: {
        /** Only list accounts of this provider, e.g. "codex". */
        provider?: string;
        /** Current timestamp in ms; defaults to Date.now(). */
        now?: number;
    },
): Promise<Array<{
    provider: string;
    account: string;
    label: string;
    model: string;
    source: "file" | "oauth" | "keychain" | "node" | "ssh";
    available: boolean;
    usedPercent: number | null;
    resetsAt: number | null;
    /** Both rolling quota windows when the provider reports them (5h/weekly coding plans); null otherwise. */
    windows: types.llm.UsageSnapshot["windows"] | null;
    planType: string | null;
    resetCredits: types.llm.UsageSnapshot["resetCredits"];
    parkedAgents: number;
    needsReconnect: boolean;
    /** The warning, critical and alert percentages every usage surface colours by. */
    thresholds?: { warnAt: number; criticalAt: number; alertAt: number };
    /** Secret-free authorization status for an isolated SSH account; not inference availability. */
    sshStatus?: "pending" | "connected" | "failed";
    /** SSH instance carrying this account's traffic; set for registry SSH rows and for plans with a chosen egress instance. */
    sshInstance?: string;
    /** Last verified local CLI authorization status; does not imply model execution or a fresh network check. */
    authStatus?: "pending" | "connected" | "failed";
    /** Gateway API catalogue health; does not imply generation success or quota. */
    gatewayHealth?: Awaited<ReturnType<typeof ctx.fns.llm.gatewayHealth>>;
}>> {
    const now = opts?.now ?? Date.now();
    const filter = opts?.provider;
    const out: any[] = [];

    const usage = await ctx.fns.llm.usageOverview({ now });
    const byKey = new Map(usage.map((u: any) => [`${u.provider}:${u.account}`, u]));
    const health = await ctx.fns.llm.accountAuthHealth({ action: "list" });
    const reconnectKeys = new Set(health.filter((item: any) => item.needsReconnect).map((item: any) => `${item.provider}:${item.account}`));

    // File-backed logins: the default path plus every "auth.<account>.json"
    // sibling. One naming convention, so a second login needs no new code.
    for (const [provider, path] of [["codex", ".codex/auth.json"], ["kimi-coding", ".kimi/credentials/kimi-code.json"]] as const) {
        if (filter && filter !== provider) continue;
        for (const account of await discoverFileAccounts(ctx, provider, path)) {
            out.push(entry(provider, account, "file", byKey, reconnectKeys));
        }
    }

    // Managed OAuth rows are presented as normal Claude accounts in user-facing
    // UI. The runtime transport remains anthropic-oauth, but a person should not
    // need that implementation detail to understand or switch accounts.
    if (!filter || filter === "anthropic-oauth" || filter === "claude-code") {
        const rows = (await ctx.fns.procs.db.select({
            sql: "SELECT account, label, expires_at FROM oauth_credentials WHERE provider = ? ORDER BY account",
            params: ["anthropic-oauth"],
        })) as any[];
        for (const row of rows) {
            const item = entry("anthropic-oauth", String(row.account ?? "default"), "oauth", byKey, reconnectKeys);
            item.label = row.label ? String(row.label) : (item.account === "default" ? "Claude managed" : item.account);
            out.push(item);
            if (Number(row.expires_at) <= now) { item.needsReconnect = true; item.available = false; }
        }
    }


    // xAI managed device-OAuth credentials are exposed under the runtime model
    // provider (`xai`) rather than their persistence adapter (`xai-oauth`).
    if (!filter || filter === "xai" || filter === "xai-oauth") {
        const rows = (await ctx.fns.procs.db.select({
            sql: "SELECT account, label, expires_at FROM oauth_credentials WHERE provider = ? ORDER BY account",
            params: ["xai-oauth"],
        })) as any[];
        for (const row of rows) {
            const item = entry("xai", String(row.account ?? "default"), "oauth", byKey, reconnectKeys);
            item.label = row.label ? String(row.label) : (item.account === "default" ? "Grok managed" : item.account);
            if (Number(row.expires_at) <= now) { item.needsReconnect = true; item.available = false; }
            out.push(item);
        }
    }

    // Claude Code accounts live in isolated CLAUDE_CONFIG_DIRs. On macOS the
    // actual tokens are in keychain services derived from those directories;
    // the directory itself is the durable account registry.
    if (!filter || filter === "claude-code") {
        for (const account of await discoverDirectoryAccounts(ctx, "claude-code")) {
            if (ctx.fns.llm.accountCredentialExists({ provider: "claude-code", account })) {
                out.push(entry("claude-code", account, "keychain", byKey, reconnectKeys));
            }
        }
        if (!out.some((a) => a.provider === "claude-code" && a.account === "default") && byKey.has("claude-code:default")) {
            out.push(entry("claude-code", "default", "keychain", byKey, reconnectKeys));
        }
    }

    // Hyper nodes (docs/hyper-node.md): one row per node; quota is the node's
    // most-used provider we are allowed to use, from its cached usage snapshot.
    if (!filter || filter === "hyper") {
        let nodes: types.node.NodeEntry[] = [];
        try { nodes = await ctx.fns.node.list({}); } catch { nodes = []; }
        for (const node of nodes) {
            const item = entry("hyper", node.name, "node", byKey, reconnectKeys);
            item.label = `hyper/${node.name}`;
            item.model = `hyper/${node.name}:`;
            const worst = [...(node.usage ?? [])].filter(u => !node.lastError && Number(u.updatedAt) > 0 && now - Number(u.updatedAt) <= 300_000 && (!u.resetsAt || u.resetsAt > now) && typeof u.usedPercent === "number" && Number.isFinite(u.usedPercent) && u.usedPercent >= 0 && u.usedPercent <= 100).sort((a, b) => (b.usedPercent ?? 0) - (a.usedPercent ?? 0))[0];
            if (worst) { item.usedPercent = worst.usedPercent; item.resetsAt = worst.resetsAt; item.planType = worst.planType; }
            if (!node.enabled || node.lastError) { item.available = false; item.needsReconnect = Boolean(node.lastError); }
            (item as any).nodeUrl = node.url; (item as any).models = node.catalog?.length ?? 0; (item as any).error = node.lastError;
            out.push(item);
        }
    }

    // Inventory follows the selected billing plan; neither plan implies measured quota.
    if ((!filter || filter === "opencode") && ctx.fns.settings?.get) {
        const reference = await ctx.fns.settings.get({ module: "llm", scopeType: "global", key: "opencodeApiKey" });
        if (typeof reference === "string" && reference.trim()) {
            const item = entry("opencode", "default", "file", byKey, reconnectKeys);
            const go = await ctx.fns.settings.get({ module: "llm", scopeType: "global", key: "opencodePlan" }) === "go";
            item.label = go ? "OpenCode Go" : "OpenCode Console";
            item.planType = go ? "Go subscription" : "Pay as you go";
            item.usedPercent = null;
            item.resetsAt = null;
            item.windows = null;
            item.resetCredits = null;
            item.available = !item.needsReconnect;
            out.push(item);
        }
    }

    // A configured Coding Plan key is inventory, not a measured quota or
    // a fresh proof of generation availability. Never read its value for UI.
    if ((!filter || filter === "zai-coding") && ctx.fns.settings?.get) {
        const reference = await ctx.fns.settings.get({ module: "llm", scopeType: "global", key: "zaiCodingApiKey" });
        if (typeof reference === "string" && reference.trim()) {
            const item = entry("zai-coding", "default", "file", byKey, reconnectKeys);
            item.label = "Z.ai";
            item.planType = "Coding Plan";
            const { instance } = ctx.fns?.llm?.codingInstance ? await ctx.fns.llm.codingInstance({ provider: "zai-coding" }) : { instance: null };
            if (instance) { item.source = "ssh"; item.sshInstance = instance; item.label = `SSH · ${instance} · Z.ai`; }
            out.push(item);
        }
    }

    if ((!filter || filter === "minimax-coding") && ctx.fns.settings?.get) {
        const reference = await ctx.fns.settings.get({ module: "llm", scopeType: "global", key: "minimaxCodingApiKey" });
        if (typeof reference === "string" && reference.trim()) {
            const item = entry("minimax-coding", "default", "file", byKey, reconnectKeys);
            item.label = "MiniMax";
            item.planType = "M Plan";
            const { instance } = ctx.fns?.llm?.codingInstance ? await ctx.fns.llm.codingInstance({ provider: "minimax-coding" }) : { instance: null };
            if (instance) { item.source = "ssh"; item.sshInstance = instance; item.label = `SSH · ${instance} · MiniMax`; }
            out.push(item);
        }
    }

    if ((!filter || filter === "oneapi") && ctx.fns.llm.gatewayHealth) {
        const gatewayHealth = await ctx.fns.llm.gatewayHealth({});
        const item = entry("oneapi", "default", "file", new Map(), new Set());
        item.label = "Asoft LLM Gate";
        item.available = gatewayHealth.status === "available";
        out.push({ ...item, gatewayHealth });
    }

    // Remote identities share the inference provider's quota namespace, but
    // never its local credential slot. Registry metadata is secret-free.
    const remote = ctx.fns.sshAccount?.registry ? await ctx.fns.sshAccount.registry({ action: "list" }) : [];
    const instances = ctx.fns.sshInstance?.list ? new Set((await ctx.fns.sshInstance.list({})).map(item => item.name)) : null;
    for (const row of remote) {
        if (instances && !instances.has(row.instance)) continue;
        if (filter && filter !== row.provider && filter !== "ssh") continue;
        const account = `ssh.${row.instance}.${row.account}`;
        const item = entry(row.provider, account, "ssh", byKey, reconnectKeys);
        item.label = `${row.instance} · ${row.provider} · ${row.account}`;
        item.model = `ssh/${row.instance}:${row.provider}/${row.account}:`;
        item.sshInstance = row.instance;
        item.needsReconnect = item.needsReconnect || row.status !== "connected";
        item.available = row.status === "connected" && item.available;
        out.push({ ...item, sshStatus: row.status });
    }

    return out;
}

function entry(provider: string, account: string, source: "file" | "oauth" | "keychain" | "node" | "ssh", byKey: Map<string, any>, reconnectKeys: Set<string>) {
    const known = byKey.get(`${provider}:${account}`);
    const usedPercent = known?.usedPercent ?? null;
    const needsReconnect = reconnectKeys.has(`${provider}:${account}`);
    return {
        provider,
        account,
        label: account === "default" ? provider : `${provider} · ${account}`,
        model: known?.model ?? `${provider}${account === "default" ? "" : `/${account}`}:`,
        source,
        sshInstance: undefined as string | undefined,
        // "Available" means there is quota left to switch INTO — the whole point
        // of listing accounts while one of them is exhausted.
        available: !needsReconnect && !(known?.parkedAgents > 0) && (usedPercent == null || usedPercent < 100),
        needsReconnect,
        usedPercent,
        resetsAt: known?.resetsAt ?? null,
        // Both rolling windows (5h/weekly for the coding plans) so the account
        // card can show each window, not only the worse one.
        windows: known?.windows ?? null,
        planType: known?.planType ?? null,
        resetCredits: known?.resetCredits ?? null,
        parkedAgents: known?.parkedAgents ?? 0,
        // One threshold pair for every surface that shows a quota: the rings,
        // the account cards and the mobile strip colour alike.
        thresholds: known?.thresholds ?? { warnAt: 30, criticalAt: 60, alertAt: 75 },
    };
}

async function discoverFileAccounts(ctx: Context, provider: "codex" | "kimi-coding", relative: string): Promise<string[]> {
    const home = ctx.env.HOME ?? process.env.HOME ?? "";
    if (!home) return [];
    const accounts: string[] = [];
    try {
        const { existsSync, readdirSync } = require("node:fs");
        if (existsSync(`${home}/${relative}`)) accounts.push("default");
        const root = `${home}/.hyper/accounts/${provider}`;
        for (const account of readdirSync(root) as string[]) {
            const { file } = ctx.fns.llm.accountCredentialPath({ provider, account });
            if (file && existsSync(file)) accounts.push(account);
        }
    } catch { return accounts; }
    return accounts;
}

async function discoverDirectoryAccounts(ctx: Context, provider: "claude-code"): Promise<string[]> {
    const home = ctx.env.HOME ?? process.env.HOME ?? "";
    const accounts = ["default"];
    try {
        const { readdirSync } = require("node:fs");
        for (const account of readdirSync(`${home}/.hyper/accounts/${provider}`) as string[]) if (account !== "default") accounts.push(account);
    } catch { /* only the default login exists */ }
    return accounts;
}
