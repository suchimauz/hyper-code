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
    /** Rows produced by llm.listAccounts. */ accounts: Array<{ provider: string; account: string; label: string; model: string; source: "file" | "oauth" | "keychain" | "node" | "ssh"; available: boolean; usedPercent: number | null; planType: string | null; resetsAt: number | null; resetCredits?: types.llm.UsageSnapshot["resetCredits"]; parkedAgents: number; needsReconnect?: boolean; gatewayHealth?: Awaited<ReturnType<typeof ctx.fns.llm.gatewayHealth>> }>;
    /** Login flows currently pending or recently completed. */ logins?: Array<{ provider: string; account: string; status: "pending" | "connected" | "failed"; verificationUri: string | null; userCode: string | null; error: string | null }>;
    /** Shared available-model catalogue from llm.listModels; never credential keys. */ models?: Record<string, string[]>;
    /** Saved node catalogue snapshots used to group available models by provider and account. */ nodes?: types.node.NodeEntry[];
    /** Current timestamp in ms. */ now?: number;
}): string {
    const now = opts.now ?? Date.now();
    const esc = (x: any) => ctx.fns.procs.ui.escape({ text: String(x ?? "") });
    const prefix = (a: typeof opts.accounts[number]) => a.source === "ssh" ? a.model : `${a.provider}${a.account === "default" ? "" : `/${a.account}`}:`;

    const remove = (a: typeof opts.accounts[number]) => {
        if (a.source === "ssh" || (a.source !== "oauth" && a.account === "default")) return "";
        return ctx.fns.ui.popup({ method: "llms.removeAccount", params: { provider: a.provider, account: a.account }, tone: "danger", size: "xs", html: `<i class="ph ph-trash" aria-hidden="true"></i><span>Remove</span>` });
    };
    const row = (a: typeof opts.accounts[number]) => {
        const remote = a.source === "ssh" ? /^ssh\/([^:]+):(?:codex|claude-code)\/([^:]+):/.exec(a.model) : null;
        const pending = remote ? [...(ctx.state.sshAccount?.flows?.values() ?? [])].find(flow => flow.instance === remote[1] && flow.account === remote[2] && flow.provider === a.provider && flow.status === "pending") : undefined;
        const used = a.usedPercent;
        const quota = !a.available ? `limit exhausted${a.resetsAt ? ` · resets ${humanDelay(a.resetsAt-now)}` : ""}` : used == null ? "usage unavailable" : `${Math.round(used)}% used · ${Math.round(100-used)}% left`;
        const status = !a.available || (used != null && used >= 75) ? "limit" : used != null && used >= 50 ? "warning" : "ready";
        const storage = storageLabel(a.source);
        const reconnect = pending ? ctx.fns.ui.popup({ method: "sshAccount.progressPopup", params: { id: pending.id }, tone: "default", size: "xs", html: "Continue login" }) : (a.needsReconnect || remote) && (a.source !== "ssh" || remote)
            ? ctx.fns.ui.popup({ method: "llms.loginPopupFor", params: { provider: a.provider === "anthropic-oauth" ? "claude-code" : a.provider, account: remote ? remote[2] : a.account, ...(remote ? { instance: remote[1] } : {}) }, tone: "warning", size: "xs", html: `<i class="ph ph-arrow-clockwise" aria-hidden="true"></i><span>Reconnect</span>` })
            : "";
        const resetCount = a.provider === "codex" && a.source !== "ssh" ? a.resetCredits?.availableCount : undefined;
        const resetDetails = a.provider === "codex" && a.resetCredits?.credits?.length ? `<details class="text-3xs text-subtle"><summary class="cursor-pointer">details</summary><div class="absolute z-20 mt-1 max-w-xs space-y-1 rounded-lg border border-ui-border bg-base-100 p-2 shadow-xl">${a.resetCredits.credits.map((credit: any) => `<div><div class="font-medium text-muted">${esc(credit.title || credit.resetType || "Codex reset")}</div>${credit.description ? `<div>${esc(credit.description)}</div>` : ""}${credit.expiresAt ? `<div>expires ${esc(new Date(typeof credit.expiresAt === "number" ? (credit.expiresAt < 10_000_000_000 ? credit.expiresAt * 1000 : credit.expiresAt) : credit.expiresAt).toLocaleString())}</div>` : ""}</div>`).join("")}</div></details>` : "";
        const reset = a.provider === "codex" && resetCount != null ? `<form method="POST" action="/llms/codex/reset" hx-post="/llms/codex/reset" hx-target="find .reset-result" hx-swap="innerHTML" class="flex items-center gap-1" onsubmit="return confirm('Use one of ${resetCount} Codex reset credits now?')"><input type="hidden" name="account" value="${esc(a.account)}"><span class="reset-result text-3xs text-subtle">${resetCount} reset${resetCount === 1 ? "" : "s"}</span>${resetDetails}${resetCount > 0 ? ctx.fns.procs.ui.button({ action: "reset-codex-limit", label: "Reset limit", type: "submit", size: "xs", tone: "warning" }) : ""}</form>` : "";
        const actions = `<span class="llm-account-actions flex flex-wrap items-center gap-1">${reset}${reconnect}${remove(a)}</span>`;
        return ctx.fns.procs.ui.row({ entity: "llm-account", id: `${a.provider}/${a.account}`, status: a.needsReconnect ? "error" : status, cells: [
            { role: "account", text: remote ? remote[2] : a.account === "default" ? "main" : a.account, class: "w-28 shrink-0 font-mono text-xs font-medium" },
            ...(remote ? [{ role: "instance", text: `SSH · ${remote[1]}`, title: "Credentials stay on this SSH instance", class: "badge badge-sm shrink-0 text-muted" }] : []),
            ...(a.planType ? [{ role: "plan", text: planName(a.provider, a.planType), title: `Subscription plan: ${a.planType}`, class: "badge badge-sm shrink-0 capitalize text-muted" }] : []),
            { role: "prefix", text: prefix(a), title: prefix(a), class: "min-w-0 flex-1 truncate font-mono text-2xs text-faint" },
            { role: "storage", text: storage.text, title: storage.title, class: "hidden shrink-0 text-3xs text-faint lg:block" },
            { role: "quota", text: quota, class: `shrink-0 text-2xs ${status === "limit" ? "text-error" : status === "warning" ? "text-warning" : "text-success"}` },
            ...(a.needsReconnect ? [{ role: "auth", text: "authentication required", class: "shrink-0 text-2xs font-medium text-error" }] : []),
            ...(a.parkedAgents ? [{ role: "parked", text: `${a.parkedAgents} parked`, class: "badge badge-sm shrink-0 text-warning" }] : []),
        ], right: actions });
    };

    const modelList = (models: string[]) => models.length ? `<ul class="llm-model-list mt-2 flex flex-wrap gap-1" aria-label="Available models">${models.map(model => `<li class="max-w-full break-all rounded bg-base-200 px-2 py-1 font-mono text-2xs">${esc(model)}</li>`).join("")}</ul>` : `<p class="mt-2 text-2xs text-faint">No available catalogue models</p>`;
    const localRow = (a: typeof opts.accounts[number]) => {
        const models = Object.values(opts.models ?? {}).flat().filter(model => model.startsWith(prefix(a)));
        return `<div class="llm-account">${row(a)}<div class="px-3 pb-3" data-model-account="${esc(`${a.provider}/${a.account}`)}">${modelList(models)}</div></div>`;
    };
    const providers = [
        { id: "codex", title: "Codex", icon: "codex:gpt", accounts: opts.accounts.filter(a => a.provider === "codex"), add: addButton(ctx, "codex", "Add Codex account") },
        { id: "claude", title: "Claude", icon: "claude-code:claude", accounts: opts.accounts.filter(a => a.provider === "claude-code" || a.provider === "anthropic-oauth"), add: addButton(ctx, "claude-code", "Add Claude account") },
        { id: "grok", title: "Grok", icon: "xai:grok", accounts: opts.accounts.filter(a => a.provider === "xai"), add: addButton(ctx, "xai", "Add Grok account") },
        { id: "kimi", title: "Kimi Coding", icon: "kimi-coding:k3", accounts: opts.accounts.filter(a => a.provider === "kimi-coding"), add: ctx.fns.procs.ui.button({ action: "add-kimi", label: "+ Add account", tone: "default", size: "sm", disabled: true, title: "Kimi multi-login is not wired yet" }) },
        { id: "zai-coding", title: "Z.ai Coding Plan", icon: "zai-coding:", accounts: opts.accounts.filter(a => a.provider === "zai-coding"), add: '<a href="/settings/declared" class="text-xs text-muted">Configure API key</a>' },
        { id: "minimax-coding", title: "MiniMax M Plan", icon: "minimax-coding:", accounts: opts.accounts.filter(a => a.provider === "minimax-coding"), add: '<a href="/settings/declared" class="text-xs text-muted">Configure API key</a>' },
    ];
    const providerSections = providers.map(p => {
        const title = `${ctx.fns.ui.modelLogo?.({ model: p.icon, bare: true }) ?? ""}<span>${esc(p.title)}</span>`;
        const heading = ctx.fns.procs.ui.heading({ title: p.title, meta: `${p.accounts.length} connected account${p.accounts.length === 1 ? "" : "s"}`, actions: p.add });
        return `<section data-provider="${p.id}"><div class="[&_h2]:flex [&_h2]:items-center [&_h2]:gap-2">${heading.replace(esc(p.title), title)}</div><div class="mt-2 overflow-hidden rounded-xl border border-ui-border bg-base-100">${p.accounts.length ? p.accounts.map(localRow).join("") : ctx.fns.procs.ui.empty({ title: `No ${p.title} accounts`, text: "Use Add account to connect one." })}</div></section>`;
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

    const catalogueOnly = Object.entries(opts.models ?? {}).filter(([provider]) => provider !== "oneapi" && !provider.startsWith("hyper/") && !provider.startsWith("ssh/"))
        .map(([provider, models]) => ({ provider, models: models.filter(model => !opts.accounts.some(a => a.provider !== "hyper" && model.startsWith(prefix(a)))) }))
        .filter(group => group.models.length);
    const catalogueOnlySections = catalogueOnly.map(group => {
        const plan = group.provider === "zai-coding" ? { title: "Z.ai Coding Plan", meta: "Subscription catalogue · entitlement not verified · quota not measured" }
            : group.provider === "minimax-coding" ? { title: "MiniMax M Plan", meta: "Subscription catalogue · entitlement not verified · quota not measured" }
            : { title: group.provider, meta: "Local / API catalogue · quota not measured" };
        return `<section data-catalogue="${esc(group.provider)}">${ctx.fns.procs.ui.heading({ title: plan.title, meta: plan.meta })}<div class="mt-2 rounded-xl border border-ui-border bg-base-100 p-3">${modelList(group.models)}</div></section>`;
    }).join("");

    const flowRows = (opts.logins ?? []).map(f => ctx.fns.procs.ui.row({ entity: "llm-login", id: `${f.provider}/${f.account}`, status: f.status, cells: [
        { role: "provider", text: providerName(f.provider), class: "w-36 shrink-0 font-medium" },
        { role: "account", text: f.account, class: "w-24 shrink-0 font-mono text-xs" },
        { role: "status", text: f.status, class: "shrink-0 text-info" },
        ...(f.userCode ? [{ role: "device-code", text: f.userCode, class: "select-all shrink-0 rounded bg-base-200 px-2 py-1 font-mono text-sm font-semibold tracking-wider" }] : []),
    ], right: ctx.fns.ui.popup({ method: "llms.loginProgressFor", params: { provider: f.provider, account: f.account }, tone: "default", size: "xs", html: "Continue login" }) })).join("");

    const html = `<div class="llm-accounts space-y-6">${providerSections}${catalogueOnlySections}${gatewaySection}${nodeSections}<script src="/llms/localDates.js" defer></script>${flowRows ? `<section>${ctx.fns.procs.ui.heading({ title: "Logins in progress", meta: "Safe authorization status only." })}<div class="mt-2 overflow-hidden rounded-xl border border-ui-border bg-base-100">${flowRows}</div></section>` : ""}</div>`;
    // Morph, not replace: the 10 s refresh must not snap an open "details" shut.
    return ctx.fns.ui.live({ id: "llm-accounts", url: "/llms/accounts", topic: "llm-accounts", swap: "outerMorph", every: 10, attrs: 'class="block"', html });
}

function addButton(ctx: Context, provider: "claude-code" | "codex" | "xai", title: string): string {
    return ctx.fns.ui.popup({ method: "llms.loginPopupFor", params: { provider }, tone: "default", size: "sm", html: `<i class="ph ph-plus" aria-hidden="true"></i><span>${ctx.fns.procs.ui.escape({ text: title })}</span>` });
}
function storageLabel(source:string){return source==="node"?{text:"Hyper node",title:"Relayed through another Hyper instance; only your client token is stored here"}:source==="oauth"?{text:"Encrypted by Hyper",title:"OAuth credential encrypted and stored by Hyper"}:source==="keychain"?{text:"Keychain",title:"Credential stored by the official CLI in macOS Keychain"}:{text:"CLI storage",title:"Credential stored in an isolated official CLI directory"};}
function providerName(p:string){return p==="hyper"?"Hyper node":p==="anthropic-oauth"?"Claude":p==="claude-code"?"Claude Code":p==="kimi-coding"?"Kimi Coding":p==="xai"?"Grok":p==="codex"?"Codex":p;}
function planName(provider:string, plan:string){const p=String(plan).toLowerCase();if(provider==="codex"&&p==="prolite")return "ChatGPT Go";return p==="pro"?"Pro":p==="max"?"Max":p==="team"?"Team":p==="enterprise"?"Enterprise":plan;}
function humanDelay(ms:number){const m=Math.floor(Math.max(0,ms)/60000),h=Math.floor(m/60),d=Math.floor(h/24);return d?`${d}d ${h%24}h`:h?`${h}h ${m%60}m`:`${m}m`;}
