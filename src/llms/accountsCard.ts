// One account surface grouped by provider. Credential storage is an adapter
// detail, never the information architecture of the page.
/** Renders subscription accounts consistently in provider-oriented groups. */
/**
 * Render one account list grouped by provider, independent of where each
 * credential is stored. Every provider uses the same row shape, plan/quota
 * fields and add-account action; storage ownership appears only as a secondary
 * badge and tooltip.
 *
 * @param opts.accounts Credential rows from llm.listAccounts.
 * @param opts.logins Safe progress state from llm.accountLoginStatus.
 * @param opts.now Current time in ms, for testing.
 */
export default function (ctx: Context, _session: Session | null, opts: {
    /** Rows produced by llm.listAccounts. */ accounts: Array<{ provider: string; account: string; label: string; model: string; source: "file" | "oauth" | "keychain" | "node" | "ssh"; available: boolean; usedPercent: number | null; planType: string | null; resetsAt: number | null; windows?: types.llm.UsageSnapshot["windows"] | null; resetCredits?: types.llm.UsageSnapshot["resetCredits"]; parkedAgents: number; needsReconnect?: boolean; sshInstance?: string; gatewayHealth?: Awaited<ReturnType<typeof ctx.fns.llm.gatewayHealth>>; thresholds?: { warnAt: number; criticalAt?: number; alertAt: number } }>;
    /** Login flows currently pending or recently completed. */ logins?: Array<{ provider: string; account: string; status: "pending" | "connected" | "failed"; verificationUri: string | null; userCode: string | null; error: string | null }>;
    /** Shared available-model catalogue from llm.listModels; never credential keys. */ models?: Record<string, string[]>;
    /** Published OpenCode Go / Go Plus comparison figures keyed by exact route. */ prices?: Record<string, types.llm.ModelPrice>;
    /** Exact locally disabled routes; kept visible with an enable action. @default [] */ disabledModels?: string[];
    /** Saved node catalogue snapshots used to group available models by provider and account. */ nodes?: types.node.NodeEntry[];
    /** MiniMax M Plan request settings shown next to the plan account. */
    minimax?: { serviceTier: string };
    /** Coding-plan egress instances: current selection per provider plus trusted instance names. */
    planInstances?: { zai: string | null; minimax: string | null; opencode?: string | null; instances: string[] };
    /** Current timestamp in ms. */ now?: number;
}): string {
    const now = opts.now ?? Date.now();
    const esc = (x: any) => ctx.fns.procs.ui.escape({ text: String(x ?? "") });
    const prefix = (a: typeof opts.accounts[number]) => a.source === "ssh" ? a.model : `${a.provider}${a.account === "default" ? "" : `/${a.account}`}:`;

    const remove = (a: typeof opts.accounts[number]) => {
        // SSH registry rows are secret-free metadata and always removable;
        // local removal stays limited to named managed/CLI credentials.
        if (a.source !== "ssh" && a.source !== "oauth" && a.account === "default") return "";
        return ctx.fns.ui.popup({ method: "llms.removeAccount", params: { provider: a.provider, account: a.account }, tone: "danger", size: "xs", html: `<i class="ph ph-trash" aria-hidden="true"></i><span>Remove</span>` });
    };
    const row = (a: typeof opts.accounts[number]) => {
        // Registry SSH rows carry an ssh/<instance>:<provider>/<account>: route. Coding
        // plans only name their egress instance and keep their own key locally, so
        // they have no route to parse and no registry account to reconnect.
        const route = a.source === "ssh" ? /^ssh\/([^:]+):(?:codex|claude-code|kimi-coding)\/([^:]+):/.exec(a.model) : null;
        const egress = a.source === "ssh" ? (a.sshInstance ?? /^ssh\/([^:]+):/.exec(a.model)?.[1] ?? null) : null;
        const remote = route ? [route[1], route[2]] : null;
        const pending = remote ? [...(ctx.state.sshAccount?.flows?.values() ?? [])].find(flow => flow.instance === remote[0] && flow.account === remote[1] && flow.provider === a.provider && flow.status === "pending") : undefined;
        const used = a.usedPercent;
        const quota = !a.available ? `limit exhausted${a.resetsAt ? ` · resets ${humanDelay(a.resetsAt-now)}` : ""}` : used == null ? "usage unavailable" : `${Math.round(used)}% used · ${Math.round(100-used)}% left`;
        // The same thresholds as the rings and the mobile strip, so one account
        // never looks yellow on the page and green in the dock.
        const warnAt = a.thresholds?.warnAt ?? 30;
        const criticalAt = a.thresholds?.criticalAt ?? 60;
        const alertAt = a.thresholds?.alertAt ?? 75;
        const status = !a.available || (used != null && used >= alertAt) ? "limit" : used != null && used >= criticalAt ? "critical" : used != null && used >= warnAt ? "warning" : "ready";
        const storage = storageLabel(a.source);
        const reconnect = pending ? ctx.fns.ui.popup({ method: "sshAccount.progressPopup", params: { id: pending.id }, tone: "default", size: "xs", html: "Continue login" }) : a.needsReconnect || a.source === "ssh"
            ? ctx.fns.ui.popup({ method: "llms.loginPopupFor", params: { provider: a.provider === "anthropic-oauth" ? "claude-code" : a.provider, account: remote ? remote[1] : a.account, ...(remote ? { instance: remote[0] } : {}) }, tone: "warning", size: "xs", html: `<i class="ph ph-arrow-clockwise" aria-hidden="true"></i><span>Reconnect</span>` })
            : "";
        const resetCount = a.provider === "codex" && a.source !== "ssh" ? a.resetCredits?.availableCount : undefined;
        const resetDetails = a.provider === "codex" && a.resetCredits?.credits?.length ? `<details class="text-3xs text-subtle"><summary class="cursor-pointer">details</summary><div class="absolute z-20 mt-1 max-w-xs space-y-1 rounded-lg border border-ui-border bg-base-100 p-2 shadow-xl">${a.resetCredits.credits.map((credit: any) => `<div><div class="font-medium text-muted">${esc(credit.title || credit.resetType || "Codex reset")}</div>${credit.description ? `<div>${esc(credit.description)}</div>` : ""}${credit.expiresAt ? `<div>expires ${esc(new Date(typeof credit.expiresAt === "number" ? (credit.expiresAt < 10_000_000_000 ? credit.expiresAt * 1000 : credit.expiresAt) : credit.expiresAt).toLocaleString())}</div>` : ""}</div>`).join("")}</div></details>` : "";
        const reset = a.provider === "codex" && resetCount != null ? `<form method="POST" action="/llms/codex/reset" hx-post="/llms/codex/reset" hx-target="find .reset-result" hx-swap="innerHTML" class="flex items-center gap-1" onsubmit="return confirm('Use one of ${resetCount} Codex reset credits now?')"><input type="hidden" name="account" value="${esc(a.account)}"><span class="reset-result text-3xs text-subtle">${resetCount} reset${resetCount === 1 ? "" : "s"}</span>${resetDetails}${resetCount > 0 ? ctx.fns.procs.ui.button({ action: "reset-codex-limit", label: "Reset limit", type: "submit", size: "xs", tone: "warning" }) : ""}</form>` : "";
        // The coding plans report two rolling windows; show each one with its
        // own tone instead of only the worse of the two.
        const windowCell = (label: string, w: { usedPercent?: number | null; resetsAt?: number | null }) => {
            const pct = Math.round(w.usedPercent ?? 0);
            const tone = pct >= alertAt ? "text-error" : pct >= criticalAt ? "text-critical" : pct >= warnAt ? "text-warning" : "text-success";
            const resets = w.resetsAt ? ` · ${humanDelay(w.resetsAt - now)}` : "";
            return { role: `quota-${label}`, text: `${label} ${pct}%${resets}`, class: `shrink-0 text-2xs font-mono ${tone}` };
        };
        const dual = (a.provider === "zai-coding" || a.provider === "minimax-coding" || a.provider === "kimi-coding" || (a.provider === 'opencode' && a.planType === 'Go subscription')) && (a.windows?.primary || a.windows?.secondary || a.windows?.tertiary)
            ? [a.windows?.primary ? windowCell("5h", a.windows.primary) : null, a.windows?.secondary ? windowCell("weekly", a.windows.secondary) : null, a.windows?.tertiary ? windowCell('monthly', a.windows.tertiary) : null].filter(Boolean) as Array<{ role: string; text: string; class: string }>
            : null;
        const actions = `<span class="llm-account-actions flex flex-wrap items-center gap-1">${reset}${reconnect}${remove(a)}</span>`;
        return ctx.fns.procs.ui.row({ entity: "llm-account", id: `${a.provider}/${a.account}`, status: a.needsReconnect ? "error" : status, cells: [
            { role: "account", text: remote ? remote[1] : a.account === "default" ? "main" : a.account, class: "w-28 shrink-0 font-mono text-xs font-medium" },
            ...(egress ? [{ role: "instance", text: `SSH · ${egress}`, title: "This plan's traffic leaves through this SSH instance", class: "badge badge-sm shrink-0 text-muted" }] : []),
            ...(a.planType ? [{ role: "plan", text: planName(a.provider, a.planType), title: `Subscription plan: ${a.planType}`, class: "badge badge-sm shrink-0 capitalize text-muted" }] : []),
            { role: "prefix", text: prefix(a), title: prefix(a), class: "min-w-0 flex-1 truncate font-mono text-2xs text-faint" },
            { role: "storage", text: storage.text, title: storage.title, class: "hidden shrink-0 text-3xs text-faint lg:block" },
            ...(dual ? dual : [{ role: "quota", text: quota, class: `shrink-0 text-2xs ${status === "limit" ? "text-error" : status === "critical" ? "text-critical" : status === "warning" ? "text-warning" : used == null ? "text-faint" : "text-success"}` }]),
            ...(a.needsReconnect ? [{ role: "auth", text: "authentication required", class: "shrink-0 text-2xs font-medium text-error" }] : []),
            ...(a.parkedAgents ? [{ role: "parked", text: `${a.parkedAgents} parked`, class: "badge badge-sm shrink-0 text-warning" }] : []),
        ], right: actions });
    };

    const canonical = (model: string) => model.startsWith('hyper/') ? model : model.includes(':') ? model.replace(/^([a-z][\w-]*)\/default:/, '$1:') : 'lmstudio:' + model;
    const disabledModels = new Set((opts.disabledModels ?? []).map(canonical));
    const figure = (value?: number | 'unlimited', usd = false) => value === 'unlimited' ? '∞' : typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `${usd ? '$' : ''}${value.toLocaleString('en-US')}` : '—';
    const modelList = (models: string[]) => {
        if (!models.length) return `<p class="mt-2 text-2xs text-faint">No available catalogue models</p>`;
        const isOpenCode = (model: string) => /^(?:(?:ssh|hyper)\/[^:]+:)*opencode(?:\/[\w.-]+)?:/.test(model);
        const ordinary = models.filter(model => !isOpenCode(model));
        const cards = ordinary.length ? `<ul class="llm-model-list mt-2 flex flex-wrap gap-1" aria-label="Available models">${ordinary.map(model => `<li class="max-w-full">${ctx.fns.llms.modelControl({model,disabled:disabledModels.has(canonical(model))})}</li>`).join('')}</ul>` : '';
        models = models.filter(isOpenCode).sort((a,b) => (opts.prices?.[a]?.order ?? Number.MAX_SAFE_INTEGER) - (opts.prices?.[b]?.order ?? Number.MAX_SAFE_INTEGER));
        if (!models.length) return cards;
        // Match opencode.ai/go: compress the Plus range, then preserve the
        // actual Go/Plus ratio within each pair. Use the complete snapshot so
        // filtering an account's models cannot rescale the same allowance.
        const maxRequests = Math.max(101, ...Object.values(opts.prices ?? {}).map(p => p.plus?.requests5h).filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0));
        const position = (n: number | 'unlimited' | undefined) => n === 'unlimited' ? 100 : typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(100, 4 + Math.pow(Math.log10(Math.max(n / 100, 1)) / Math.log10(maxRequests / 100), 2.2) * 78) : 0;
        const rows = models.map(model => {
            const prefix = /^(?:(?:ssh|hyper)\/[^:]+:)*(?:[a-z][\w-]*(?:\/[\w.-]+)?:)/.exec(model)?.[0] ?? '';
            const price = opts.prices?.[model];
            const note = price?.note ?? 'Official Go estimate unavailable';
            const source = price?.updatedAt ? ` · Updated ${new Date(price.updatedAt).toISOString()}` : '';
            const plusRequests = price?.plus?.requests5h;
            const lanes = (['go','plus'] as const).map(tier => {
                const n = price?.[tier]?.requests5h;
                const width = tier === 'go' && typeof n === 'number' && Number.isFinite(n) && n >= 0 && typeof plusRequests === 'number' && Number.isFinite(plusRequests) && plusRequests > 0
                    ? Math.min(100, position(plusRequests) * n / plusRequests)
                    : position(n);
                return `<span class="llm-go-lane"><span class="llm-go-bar llm-go-bar-${tier}" style="width:${width}%"></span></span>`;
            }).join('');
            const costs = `<td class="llm-go-bars" aria-hidden="true">${lanes}</td><td class="llm-model-rate" title="${esc(note+source)}"><span class="llm-go-number">${figure(price?.go?.requests5h)}</span><span class="llm-go-number llm-go-plus">${figure(price?.plus?.requests5h)}</span></td><td class="llm-model-rate" title="${esc(note+source)}"><span class="llm-go-number">${figure(price?.go?.monthlyUsd,true)}</span><span class="llm-go-number llm-go-plus">${figure(price?.plus?.monthlyUsd,true)}</span></td>`;
            return `<tr><th scope="row" class="llm-model-name" title="${esc(model)}">${esc(model.slice(prefix.length))}</th>${costs}<td class="llm-model-enabled">${ctx.fns.llms.modelControl({model,disabled:disabledModels.has(canonical(model)),switchOnly:true})}</td></tr>`;
        }).join('');
        return `${cards}<div class="llm-model-table-wrap mt-2"><table class="llm-model-table" aria-label="OpenCode Go estimated requests and monthly usage"><caption><a href="https://opencode.ai/go" target="_blank" rel="noopener noreferrer">OpenCode Go</a> · <span class="llm-go-legend">Go</span> / <span class="llm-go-plus">Go Plus</span> · estimates, not remaining quota · — unpublished</caption><thead><tr><th scope="col">Model</th><th scope="col" class="llm-go-bars"><span class="sr-only">Go / Go Plus comparison</span></th><th scope="col">Est. requests / 5h</th><th scope="col">Monthly usage</th><th scope="col"><span class="sr-only">Enabled</span></th></tr></thead><tbody>${rows}</tbody></table><p class="llm-go-footnote">Go / Go Plus comparison, not PAYG prices. Shared limits; do not add model allowances. Bars use OpenCode’s nonlinear scale; each Go / Go Plus pair preserves its request ratio.</p></div>`;
    };
    // MiniMax M Plan exposes settings that change how requests are made:
    // the admission tier and the output budget (thinking tokens count
    // against it). They are shown next to the account so the person can see
    // and change them where the plan itself lives.
    const minimaxSettings = (a: typeof opts.accounts[number]) => {
        if (a.provider !== "minimax-coding" || !opts.minimax) return "";
        return ctx.fns.llms.minimaxSettings({ serviceTier: opts.minimax.serviceTier });
    };
    const localRow = (a: typeof opts.accounts[number]) => {
        const models = Object.values(opts.models ?? {}).flat().filter(model => model.startsWith(prefix(a)));
        const planInstance = a.provider !== "zai-coding" && a.provider !== "minimax-coding" && a.provider !== "opencode" || !opts.planInstances ? "" : ctx.fns.llms.planInstanceSettings({ provider: a.provider, instance: a.provider === "opencode" ? opts.planInstances.opencode ?? null : a.provider === "zai-coding" ? opts.planInstances.zai : opts.planInstances.minimax, instances: opts.planInstances.instances });
        const refreshModels = a.provider === "opencode" ? `<div class="px-3 pb-3"><a href="/settings/declared" class="text-xs text-muted">Plan mode: ${a.planType === "Go subscription" ? "Go subscription" : "Pay as you go"} · change</a> · <a href="https://opencode.ai/console" target="_blank" rel="noopener noreferrer" class="text-xs text-muted">${a.planType === "Go subscription" ? "Console Go" : "Console billing"}</a> ${ctx.fns.ui.popup({ method: "llms.refreshOpencodeModels", params: {}, tone: "default", size: "xs", html: "Refresh models" })}</div>` : "";
        return `<div class="llm-account">${row(a)}${ctx.fns.llms.quotaCards({ account: a, now })}<div class="llm-account-models" data-model-account="${esc(`${a.provider}/${a.account}`)}"><div class="llm-catalogue-heading"><h3>Доступные модели</h3><span>${models.length}</span></div>${modelList(models)}</div>${refreshModels}${minimaxSettings(a)}${planInstance}</div>`;
    };
    const providers = [
        { id: "codex", title: "Codex", icon: "codex:gpt", accounts: opts.accounts.filter(a => a.provider === "codex"), add: addButton(ctx, "codex", "Add Codex account") },
        { id: "claude", title: "Claude", icon: "claude-code:claude", accounts: opts.accounts.filter(a => a.provider === "claude-code" || a.provider === "anthropic-oauth"), add: addButton(ctx, "claude-code", "Add Claude account") },
        { id: "grok", title: "Grok", icon: "xai:grok", accounts: opts.accounts.filter(a => a.provider === "xai"), add: addButton(ctx, "xai", "Add Grok account") },
        { id: "kimi", title: "Kimi Coding", icon: "kimi-coding:k3", accounts: opts.accounts.filter(a => a.provider === "kimi-coding"), add: addButton(ctx, "kimi-coding", "Add Kimi account") },
        { id: "opencode", title: opts.accounts.some(a => a.provider === "opencode" && a.planType === "Go subscription") ? "OpenCode Go" : "OpenCode Console", icon: "opencode:", accounts: opts.accounts.filter(a => a.provider === "opencode"), add: '<a href="/settings/declared" class="text-xs text-muted">Configure API key</a>' },
        { id: "zai-coding", title: "Z.ai", icon: "zai-coding:", accounts: opts.accounts.filter(a => a.provider === "zai-coding"), add: '<a href="/settings/declared" class="text-xs text-muted">Configure API key</a>' },
        { id: "minimax-coding", title: "MiniMax", icon: "minimax-coding:", accounts: opts.accounts.filter(a => a.provider === "minimax-coding"), add: '<a href="/settings/declared" class="text-xs text-muted">Configure API key</a>' },
    ];
    const initialProvider = providers.find(p => p.accounts.length)?.id ?? providers[0]!.id;
    const providerNav = providers.map(p => {
        const reconnect = p.accounts.some(a => a.needsReconnect);
        const status = reconnect ? "Требуется вход" : p.accounts.length ? `${p.accounts.length} аккаунт${p.accounts.length > 1 ? 'а' : ''}` : "Не подключён";
        return `<button type="button" id="llm-provider-tab-${p.id}" role="tab" aria-controls="llm-provider-panel-${p.id}" aria-selected="${p.id === initialProvider}" tabindex="${p.id === initialProvider ? '0' : '-1'}" data-llm-provider="${p.id}" data-connected="${p.accounts.length > 0}" class="llm-provider-choice"><span class="llm-provider-logo" aria-hidden="true">${ctx.fns.ui.modelLogo?.({ model: p.icon, bare: true }) ?? ''}</span><span class="llm-provider-label"><strong>${esc(p.title)}</strong><small>${status}</small></span><span class="llm-provider-dot ${reconnect ? 'text-warning' : p.accounts.length ? 'text-success' : 'text-muted'}" aria-hidden="true">●</span></button>`;
    }).join('');
    const providerSections = providers.map(p => {
        const catalogue = Object.entries(opts.models ?? {}).filter(([key]) => key === p.id || p.id === 'claude' && ['claude-code','anthropic-oauth'].includes(key) || p.id === 'grok' && key === 'xai' || p.id === 'kimi' && key === 'kimi-coding').flatMap(([, models]) => models).filter(model => !opts.accounts.some(a => model.startsWith(prefix(a))));
        return `<section id="llm-provider-panel-${p.id}" data-provider="${p.id}" role="tabpanel" aria-labelledby="llm-provider-tab-${p.id}" tabindex="0"${p.id === initialProvider ? '' : ' hidden'} class="llm-provider-panel"><header class="llm-provider-heading"><span class="llm-provider-logo" aria-hidden="true">${ctx.fns.ui.modelLogo?.({ model: p.icon, bare: true }) ?? ''}</span><div><h2>${esc(p.title)}</h2><p>${p.accounts.length ? `${p.accounts.length} подключённых аккаунтов` : 'Подключите аккаунт, чтобы использовать модели'}</p></div><div class="llm-provider-add">${p.add}</div></header><div class="llm-provider-accounts">${p.accounts.length ? p.accounts.map(localRow).join('') : ctx.fns.procs.ui.empty({ title: `No ${p.title} accounts`, text: 'Use Add account to connect one.' })}${catalogue.length ? `<div class="llm-account-models" data-catalogue="${esc(p.id)}"><p class="text-xs text-muted">Каталог · доступ по подписке не проверен · квота не измерена</p>${modelList(catalogue)}</div>` : ''}</div></section>`;
    }).join("");

    const gateway = opts.accounts.find(a => a.provider === "oneapi");
    const health = gateway?.gatewayHealth;
    const gatewayStatus = health?.status ?? "unknown";
    const gatewayDetail = health?.reason === "disabled" ? "Disabled · set base URL and API key in settings" : health?.reason === "missing-key" ? "Configured URL · API key missing" : gatewayStatus === "available" ? "API /models available · generation not verified" : gatewayStatus === "unavailable" ? "API /models unavailable · generation not verified" : "API availability unknown · generation not verified";
    const gatewaySection = gateway ? `<section data-provider="oneapi">${ctx.fns.procs.ui.heading({ title: "Asoft LLM Gate", meta: "OpenAI-compatible gateway · no quota data" })}<div class="mt-2 rounded-xl border border-ui-border bg-base-100 p-3"><div class="text-sm font-medium">${esc(gatewayStatus)}</div><div class="text-xs text-muted">${esc(gatewayDetail)}</div><div class="text-2xs text-faint">${health?.checkedAt ? `Checked ${esc(new Date(health.checkedAt).toLocaleTimeString())} · cached up to 60 s` : "Not checked"} · saved models stay selectable offline</div>${modelList((health?.models ?? []).map(model => `oneapi:${model}`))}</div></section>` : "";

    const nodeSections = (opts.nodes ?? []).map(node => {
        const visible = new Set(opts.models?.[`hyper/${node.name}`] ?? []);
        if (!node.enabled || !node.catalogAt || !visible.size || /^models 4(?!08:|29:)\d\d:/.test(node.lastError ?? "")) return "";
        const groups = new Map<string, { provider: string; account: string; models: string[] }>();
        for (const item of node.catalog ?? []) {
            const model = `hyper/${node.name}:${item.id}`;
            if (!visible.has(model)) continue;
            const key = JSON.stringify([item.provider, item.account]);
            const group = groups.get(key) ?? { provider: item.provider, account: item.account, models: [] };
            if (!group.models.includes(model)) group.models.push(model);
            groups.set(key, group);
        }
        const accountQuota = (group: { provider: string; account: string }) => {
            const usage = node.usage?.find(item => item.provider === group.provider && item.account === group.account);
            const value = usage?.usedPercent;
            const known = typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
            const measuredAt = Number(usage?.updatedAt ?? 0);
            const stale = Boolean(node.lastError) || !measuredAt || now - measuredAt > 5 * 60_000 || Boolean(usage?.resetsAt && usage.resetsAt <= now);
            const state = !known ? "unknown" : stale ? "stale" : "fresh";
            const quota = known ? `${Math.round(value)}% used · ${Math.round(100 - value)}% left` : "Usage unavailable";
            const localDate = (value?: number | null) => {
                if (!value || !Number.isFinite(value) || Math.abs(value) > 8.64e15) return "";
                const date = new Date(value);
                const fallback = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
                return `<time data-llm-local-time datetime="${date.toISOString()}">${esc(fallback)} UTC</time>`;
            };
            const resetDate = localDate(usage?.resetsAt);
            const reset = resetDate ? `${usage!.resetsAt! <= now ? "Последний сброс" : "Сброс лимита"}: ${resetDate}` : "Время сброса неизвестно";
            const windows = Object.entries(usage?.windows ?? {}).map(([name, w]) => {
                if (!w) return "";
                const date = localDate(w.resetsAt);
                return `${esc(name)}: ${esc(w.usedPercent)}% used${date ? ` · сброс: ${date}` : ""}`;
            }).filter(Boolean).join("; ");
            const checkedDate = localDate(measuredAt);
            const checked = checkedDate ? ` · Замер: ${checkedDate}` : " · Время замера неизвестно";
            return `<div class="llm-node-quota text-2xs text-muted" data-quota-state="${state}"><span>${esc(quota)} · ${state}</span>${usage?.planType ? `<span> · ${esc(usage.planType)}</span>` : ""}<div>${reset}${checked}${windows ? ` · ${windows}` : ""}</div></div>`;
        };
        return `<section class="llm-node-catalogue" data-node="${esc(node.name)}">${ctx.fns.procs.ui.heading({ title: `Hyper node · ${node.name}`, meta: `${groups.size} ${groups.size === 1 ? "account" : "accounts"} in ${node.lastError ? "cached" : "available"} catalogue${node.lastError ? " · node unavailable" : ""}` })}<div class="mt-2 divide-y divide-ui-border rounded-xl border border-ui-border bg-base-100">${[...groups.values()].map(group => `<div class="llm-node-account p-3" data-node-account="${esc(`${group.provider}/${group.account}`)}"><div class="text-sm font-medium">${esc(group.account)}</div><div class="text-2xs text-muted">${esc(group.provider)} · node ${esc(node.name)} · ${group.models.length} models</div>${accountQuota(group)}${modelList(group.models)}</div>`).join("")}</div></section>`;
    }).join("");

    const catalogueOnly = Object.entries(opts.models ?? {}).filter(([provider]) => !['oneapi','codex','claude-code','anthropic-oauth','xai','kimi-coding','opencode','zai-coding','minimax-coding'].includes(provider) && !provider.startsWith("hyper/") && !provider.startsWith("ssh/"))
        .map(([provider, models]) => ({ provider, models: models.filter(model => !opts.accounts.some(a => a.provider !== "hyper" && model.startsWith(prefix(a)))) }))
        .filter(group => group.models.length);
    const catalogueOnlySections = catalogueOnly.map(group => {
        const plan = group.provider === "zai-coding" ? { title: "Z.ai Coding Plan", meta: "Subscription catalogue · entitlement not verified · quota not measured" }
            : group.provider === "minimax-coding" ? { title: "MiniMax M Plan", meta: "Subscription catalogue · entitlement not verified · quota not measured" }
            : group.provider === "opencode" ? { title: "OpenCode Console", meta: "Pay as you go · balance and usage unavailable" }
            : { title: group.provider, meta: "Local / API catalogue · quota not measured" };
        return `<section data-catalogue="${esc(group.provider)}">${ctx.fns.procs.ui.heading({ title: plan.title, meta: plan.meta })}<div class="mt-2 rounded-xl border border-ui-border bg-base-100 p-3">${modelList(group.models)}</div></section>`;
    }).join("");

    const flowRows = (opts.logins ?? []).map(f => ctx.fns.procs.ui.row({ entity: "llm-login", id: `${f.provider}/${f.account}`, status: f.status, cells: [
        { role: "provider", text: providerName(f.provider), class: "w-36 shrink-0 font-medium" },
        { role: "account", text: f.account, class: "w-24 shrink-0 font-mono text-xs" },
        { role: "status", text: f.status, class: "shrink-0 text-info" },
        ...(f.userCode ? [{ role: "device-code", text: f.userCode, class: "select-all shrink-0 rounded bg-base-200 px-2 py-1 font-mono text-sm font-semibold tracking-wider" }] : []),
    ], right: ctx.fns.ui.popup({ method: "llms.loginProgressFor", params: { provider: f.provider, account: f.account }, tone: "default", size: "xs", html: "Continue login" }) })).join("");

    const html = `<div class="llm-accounts"><div data-llm-section="subscriptions"><div class="llm-focus-tools"><label class="llm-provider-search"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><input id="llm-provider-search" type="search" placeholder="Найти провайдера" aria-label="Найти провайдера" autocomplete="off"></label><button type="button" class="llm-connected-filter" aria-pressed="false">Подключённые</button><span class="llm-refresh-note">Обновление каждые 10 с</span></div><div class="llm-focus-layout"><div class="llm-provider-nav" role="tablist" aria-label="Провайдеры подписок" aria-orientation="vertical">${providerNav}</div><div class="llm-provider-detail">${providerSections}<p class="llm-provider-empty" hidden>Провайдер не найден. Измените поиск или отключите фильтр.</p></div></div>${flowRows ? `<section class="llm-login-progress">${ctx.fns.procs.ui.heading({ title: "Logins in progress", meta: "Safe authorization status only." })}<div class="mt-2 overflow-hidden rounded-xl border border-ui-border bg-base-100">${flowRows}</div></section>` : ''}</div><div data-llm-section="api" class="llm-api-catalogues" hidden>${catalogueOnlySections}${gatewaySection}</div><div data-llm-section="nodes" class="llm-node-catalogues" hidden>${nodeSections}</div><script src="/llms/localDates.js" defer></script><script src="/llms/focus.js" defer></script></div>`;
    // Morph, not replace: the 10 s refresh must not snap an open "details" shut.
    return ctx.fns.ui.live({ id: "llm-accounts", url: "/llms/accounts", topic: "llm-accounts", swap: "outerMorph", every: 10, attrs: 'class="block"', html });
}

function addButton(ctx: Context, provider: "claude-code" | "codex" | "xai" | "kimi-coding", title: string): string {
    return ctx.fns.ui.popup({ method: "llms.loginPopupFor", params: { provider }, tone: "default", size: "sm", html: `<i class="ph ph-plus" aria-hidden="true"></i><span>${ctx.fns.procs.ui.escape({ text: title })}</span>` });
}
function storageLabel(source:string){return source==="node"?{text:"Hyper node",title:"Relayed through another Hyper instance; only your client token is stored here"}:source==="oauth"?{text:"Encrypted by Hyper",title:"OAuth credential encrypted and stored by Hyper"}:source==="keychain"?{text:"Keychain",title:"Credential stored by the official CLI in macOS Keychain"}:{text:"CLI storage",title:"Credential stored in an isolated official CLI directory"};}
function providerName(p:string){return p==="hyper"?"Hyper node":p==="anthropic-oauth"?"Claude":p==="claude-code"?"Claude Code":p==="kimi-coding"?"Kimi Coding":p==="xai"?"Grok":p==="codex"?"Codex":p;}
function planName(provider:string, plan:string){const p=String(plan).toLowerCase();if(provider==="codex"&&p==="prolite")return "ChatGPT Go";return p==="pro"?"Pro":p==="max"?"Max":p==="team"?"Team":p==="enterprise"?"Enterprise":plan;}
function humanDelay(ms:number){const m=Math.floor(Math.max(0,ms)/60000),h=Math.floor(m/60),d=Math.floor(h/24);return d?`${d}d ${h%24}h`:h?`${h}h ${m%60}m`:`${m}m`;}
