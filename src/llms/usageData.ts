/**
 * Collects local and remote subscription quotas and a narrow gateway health badge snapshot
 *
 * Use for desktop and read-only mobile usage indicators. Starts a shared nonblocking quota refresh, reads connected local snapshots and the shared model catalogue, preserves remote stale/unavailable states, and returns only quota and gateway badge data, without credentials. Optionally includes connected accounts with no quota snapshot and removes disconnected accounts for inventory-supported providers.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Merge connected subscription inventory, including accounts without quota snapshots. @default false */
        includeConnected?: boolean;
    },
): Promise<{ entries: types.llms.UsageEntry[]; gateway: { status: string; reason?: string; models: string[] } | null }> {
    // Never hold page rendering on provider I/O. One background refresh is
        // shared per process; every request immediately renders the latest durable
        // snapshots from the tiny kv set.
        const state = ((ctx.state as any).llmUsageRefresh ??= { promise: null, startedAt: 0 });
        if (!state.promise && Date.now() - Number(state.startedAt || 0) >= 60_000) {
            state.startedAt = Date.now();
            state.promise = ctx.fns.llm.refreshUsage({ maxAgeMs: 60_000 })
                .catch(() => undefined)
                .finally(() => { state.promise = null; });
        }

        const local = await ctx.fns.llm.usageOverview({ connectedOnly: true });
        // One threshold pair for every surface: the rings, the account cards
        // and the mobile strip must colour the same account identically.
        const thresholds = { warnAt: 30, criticalAt: 60, alertAt: 75 };
        if (local.length) Object.assign(thresholds, local[0]?.thresholds ?? {});
        let entries: types.llms.UsageEntry[] = local.filter(entry => entry.provider !== "hyper").map(({ resetCredits: _resetCredits, ...entry }) => ({ ...entry, models: [] }));
        if (opts.includeConnected) {
            const inventory = (await ctx.fns.llm.listAccounts({})).filter(account => account.provider !== "hyper" && account.provider !== "oneapi");
            const supported = new Set(["codex", "kimi-coding", "claude-code", "anthropic-oauth", "xai", "zai-coding", "minimax-coding", "opencode"]);
            const key = (account: { provider: string; account: string }) => JSON.stringify([account.provider, account.account]);
            const connected = new Set(inventory.map(key));
            entries = entries.filter(entry => !supported.has(entry.provider) || connected.has(key(entry)));
            const snapshots = new Map(entries.map(entry => [key(entry), entry]));
            for (const account of inventory) {
                const existing = snapshots.get(key(account));
                if (existing) {
                    existing.available = account.available;
                    existing.needsReconnect = account.needsReconnect;
                    continue;
                }
                const entry: types.llms.UsageEntry = {
                    provider: account.provider, account: account.account,
                    label: account.label, model: account.model, models: [],
                    usedPercent: null, resetsAt: null, planType: account.planType,
                    parkedAgents: account.parkedAgents, tone: "neutral", updatedAt: 0,
                    quotaStatus: "unavailable", available: account.available,
                    needsReconnect: account.needsReconnect,
                    thresholds,
                };
                entries.push(entry);
                snapshots.set(key(account), entry);
            }
        }
        // A local reference check keeps desktop rendering independent of the
        // full account inventory and provider I/O. Never resolve the key here.
        if (!opts.includeConnected && ctx.fns.settings?.get) {
            for (const plan of [["zai-coding", "Z.ai", "Coding Plan", "zaiCodingApiKey"], ["minimax-coding", "MiniMax", "M Plan", "minimaxCodingApiKey"], ["opencode", "OpenCode Console", "Pay as you go", "opencodeApiKey"]] as const) {
                const [provider, label, planType, settingKey] = plan;
                const reference = await ctx.fns.settings.get({ module: "llm", scopeType: "global", key: settingKey });
                const configured = typeof reference === "string" && Boolean(reference.trim());
                entries = entries.filter(entry => entry.provider !== provider || configured);
                if (configured && !entries.some(entry => entry.provider === provider && entry.account === "default")) {
                    entries.push({ provider, account: "default", label,
                        model: `${provider}:`, models: [], usedPercent: null, resetsAt: null,
                        planType, parkedAgents: 0, tone: "neutral", updatedAt: 0,
                        quotaStatus: "unavailable", thresholds });
                }
            }
        }

        // Use the shared catalogue cache: it refreshes nodes with a five-minute TTL,
        // retains transient failures, and omits denied/disabled/empty catalogues.
        const models = await ctx.fns.llm.listModels({});
        const planInstance = (provider: "zai-coding" | "minimax-coding" | "opencode") => ctx.fns?.llm?.codingInstance
            ? ctx.fns.llm.codingInstance({ provider }).catch(() => ({ instance: null }))
            : Promise.resolve({ instance: null });
        const [zaiPlan, minimaxPlan, opencodePlan] = await Promise.all([planInstance("zai-coding"), planInstance("minimax-coding"), planInstance("opencode")]);
        const opencodeGo = ctx.fns.settings?.get ? await ctx.fns.settings.get({ module: "llm", scopeType: "global", key: "opencodePlan" }) === "go" : false;
        // Separate plan caches: a previous PAYG result must never become Go allowance.
        const budgetKey = opencodeGo ? "opencodeGoUi" : "opencodeBudgetUi";
        const budgetState = ((ctx.state as any)[budgetKey] ??= { value: { available: false }, startedAt: 0, promise: null });
        if (entries.some(entry => entry.provider === "opencode") && ctx.fns.llm.opencodeUsage && !budgetState.promise && Date.now() - budgetState.startedAt >= 60_000) {
            budgetState.startedAt = Date.now();
            budgetState.promise = ctx.fns.llm.opencodeUsage({})
                .then(value => { budgetState.value = { available: value.available, spentUsd: value.spentUsd, limitUsd: value.limitUsd, resetsAt: value.resetsAt }; })
                .catch(() => { budgetState.value = { available: false }; })
                .finally(() => { budgetState.promise = null; });
        }
        for (const entry of entries) {
            // The catalogue prefix follows the provider identity, so compute it
            // before any ssh account identity is borrowed for usage grouping.
            const cataloguePrefix = `${entry.provider}${entry.account === "default" ? "" : `/${entry.account}`}:`;
            // Console billing has no verified quota contract: never turn PAYG into subscription percentages.
            if (entry.provider === "opencode") {
                entry.label = (opencodeGo ? "OpenCode Go" : "OpenCode Console") + (opencodePlan.instance ? ` · ${opencodePlan.instance}` : "");
                entry.planType = opencodeGo ? "Go subscription" : "Pay as you go";
                entry.usedPercent = null;
                entry.resetsAt = null;
                entry.windows = undefined;
                entry.updatedAt = 0;
                entry.tone = "neutral";
                entry.quotaStatus = "unavailable";
                const budget = budgetState.value;
                const valid = !opencodeGo && budget.available === true && Number.isFinite(budget.spentUsd) && budget.spentUsd >= 0
                    && (budget.limitUsd === null || Number.isFinite(budget.limitUsd) && budget.limitUsd >= 0);
                entry.memberBudget = valid ? { available: true, spentUsd: budget.spentUsd, limitUsd: budget.limitUsd,
                    ...(Number.isFinite(budget.resetsAt) && budget.resetsAt > 0 ? { resetsAt: budget.resetsAt } : {}) } : { available: false };
                entry.memberBudgetText = opencodeGo ? "Go quota unavailable" : valid ? `Monthly member budget $${budget.spentUsd.toFixed(2)} / ${budget.limitUsd === null ? "unlimited" : `$${budget.limitUsd.toFixed(2)}`}` : "Monthly member budget unavailable";
            }
            if (entry.provider === "zai-coding" || entry.provider === "minimax-coding") {
                const egress = entry.provider === "minimax-coding" ? minimaxPlan.instance : zaiPlan.instance;
                // A plan leaving through an SSH instance is remote traffic, not
                // local: record the ssh account so usage groups file it under that
                // instance. The model route stays <provider>: because resolveEndpoint
                // only accepts ssh/ routes for codex and claude-code; it re-adds the
                // chosen egress instance itself.
                if (egress && entry.account === "default") entry.account = `ssh.${egress}.default`;
                entry.label = (entry.provider === "minimax-coding" ? "MiniMax" : "Z.ai") + (egress ? ` · ${egress}` : "");
                if (entry.usedPercent == null) entry.quotaStatus = "unavailable";
                else if (!entry.updatedAt || Date.now() - entry.updatedAt > 300_000) entry.quotaStatus = "stale";
            }
            // The catalogue prefix follows the provider identity, not the ssh account
            // borrowed above, so keep it before that rewrite.
            // Registry-backed SSH accounts keep an ssh/<instance> model route.
            // Plan providers only borrowed the instance identity above, so their
            // models still live under the plain <provider>: catalogue.
            const isPlanEgress = entry.provider === "zai-coding" || entry.provider === "minimax-coding";
            if (entry.account.startsWith("ssh.") && !isPlanEgress) {
                const identity = /^ssh\.(.+)\.([^.]+)$/.exec(entry.account);
                const prefix = identity ? `ssh/${identity[1]}:${entry.provider}/${identity[2]}:` : "";
                entry.models = prefix ? Object.values(models).flat().filter(model => model.startsWith(prefix)) : [];
                if (prefix) entry.model = prefix;
                continue;
            }
            const prefix = cataloguePrefix;
            const catalogue = Object.values(models).flat();
            entry.models = catalogue.filter(model => model.startsWith(prefix));
            if (opts.includeConnected && entry.account !== "default" && !entry.models.length) {
                const base = `${entry.provider}:`;
                entry.models = [...new Set(catalogue.filter(model => model.startsWith(base)).map(model => `${prefix}${model.slice(base.length)}`))];
            }
        }
        const nodes = await ctx.fns.node.list({}).catch(() => []);
        for (const node of nodes) {
            const visible = new Set(models[`hyper/${node.name}`] ?? []);
            if (!node.enabled || !node.catalogAt || /^models 4(?!08:|29:)\d\d:/.test(node.lastError ?? "")) continue;
            const seen = new Set<string>();
            for (const item of node.catalog ?? []) {
                if (!visible.has(`hyper/${node.name}:${item.id}`)) continue;
                const key = JSON.stringify([item.provider, item.account]);
                if (seen.has(key)) continue;
                seen.add(key);
                const usage = node.usage?.find(row => row.provider === item.provider && row.account === item.account);
                const value = usage?.usedPercent;
                const usedPercent = typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
                const measuredAt = Number(usage?.updatedAt ?? 0);
                const stale = Boolean(node.lastError) || !measuredAt || Date.now() - measuredAt > 5 * 60_000 || Boolean(usage?.resetsAt && usage.resetsAt <= Date.now());
                entries.push({
                    provider: item.provider, account: item.account, node: node.name,
                    models: (node.catalog ?? []).filter(m => m.provider === item.provider && m.account === item.account && visible.has(`hyper/${node.name}:${m.id}`)).map(m => `hyper/${node.name}:${m.id}`),
                    label: `${node.name} · ${item.account} · ${item.provider}`,
                    model: `${item.provider}:`, usedPercent,
                    resetsAt: usage?.resetsAt ?? null, planType: usage?.planType ?? null,
                    parkedAgents: usage?.parkedAgents ?? 0,
                    updatedAt: measuredAt,
                    tone: usedPercent != null && usedPercent >= thresholds.alertAt ? "error" : usedPercent != null && usedPercent >= thresholds.criticalAt ? "critical" : usedPercent != null && usedPercent >= thresholds.warnAt ? "warning" : "neutral",
                    quotaStatus: usedPercent == null ? "unavailable" : stale ? "stale" : undefined,
                    thresholds,
                });
            }
        }
        const gateway = ctx.fns.llm.gatewayHealth ? await ctx.fns.llm.gatewayHealth({}) : null;
        return { entries, gateway: gateway ? { status: gateway.status, ...(gateway.reason !== undefined ? { reason: gateway.reason } : {}), models: gateway.models ?? [] } : null };
}
