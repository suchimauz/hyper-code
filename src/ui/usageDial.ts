/**
 * Render a provider/account quota matrix grouped by local machine, Hyper node or SSH.
 * Shows measured five-hour, weekly and monthly periods together; missing or expired
 * measurements remain explicitly unknown. Generic quota is shown with an explicit unknown-period label.
 * Keeps provider reset timestamps in the tooltip, localized by the browser.
 * Returns empty markup when there are no connections. Uses shared severity thresholds.
 * @param opts.entries Connection snapshots from llms.quotaData.
 * @param opts.now Current epoch milliseconds for expiry checks; defaults to Date.now().
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Local usage snapshots and node/provider/account snapshots, with optional freshness status. */
        entries: Array<{
            /** Safe monetary budget summary, not a subscription percentage. */
            memberBudgetText?: string;
            provider: string;
            account: string;
            label: string;
            model?: string;
            /** Available catalogue model IDs for this provider/account; the full list lives on /llms, not in the hover card. */
            models?: string[];
            /** Measured 5h, weekly and optional monthly quota windows, rendered as simultaneous matrix rows. */
            windows?: types.llm.UsageSnapshot["windows"];
            /** Hyper node name for remote credentials; omitted for local credentials. */
            node?: string;
            /** Remote snapshot is outdated or has no measured quota; omitted for current data. */
            quotaStatus?: "stale" | "unavailable";
            usedPercent: number | null;
            resetsAt: number | null;
            planType: string | null;
            parkedAgents: number;
            tone: "neutral" | "warning" | "critical" | "error";
            /** Shared quota colour thresholds from usageOverview. */
            thresholds?: { warnAt: number; criticalAt: number; alertAt: number };
        }>;
        /** Optional OpenAI-compatible gateway health; never interpreted as subscription quota. */
        gateway?: { status: string; reason?: string; models?: string[]; checkedAt?: number | null } | null;
        /** Current timestamp in ms; defaults to Date.now(). */
        now?: number;
        /**
         * Quota thresholds shared with every other usage surface.
         * Defaults to the settings' own values (30% warning, 60% critical,
         * 75% alert).
         */
        thresholds?: { warnAt: number; criticalAt: number; alertAt: number };
    },
): string {
    const esc = (s: any) => ctx.fns.procs.ui.escape({ text: s });
    const entries = [...(opts.entries ?? [])];
    if (opts.gateway) entries.push({provider: "oneapi", account: "default", label: "Asoft LLM Gate", usedPercent: null, resetsAt: null, planType: null, parkedAgents: 0, tone: "neutral"});
    if (!entries.length) return "";
    const now = opts.now ?? Date.now();
    // Four steps, so the ring heats up instead of staying green until the
    // quota is nearly gone: green, yellow, orange, red.
    const toneClass = (percent: number | null, thresholds: { warnAt: number; criticalAt: number; alertAt: number }) => percent == null || !Number.isFinite(percent) ? "text-faint" : percent >= thresholds.alertAt ? "text-error" : percent >= thresholds.criticalAt ? "text-critical" : percent >= thresholds.warnAt ? "text-warning" : "text-success";

    const groups = new Map<string, { label: string; entries: typeof entries }>();
    for (const entry of entries) {
        const ssh = /^ssh\/([^:]+):/.exec(entry.model ?? '')?.[1] ?? /^ssh\.(.+)\.[^.]+$/.exec(entry.account)?.[1];
        const key = entry.provider === 'oneapi' ? 'gateway' : entry.node ? `hyper/${entry.node}` : ssh ? `ssh/${ssh}` : 'local';
        const label = entry.provider === 'oneapi' ? 'Gate' : entry.node ? `Hyper · ${entry.node}` : ssh ? `SSH · ${ssh}` : 'Local';
        if (!groups.has(key)) groups.set(key, { label, entries: [] });
        groups.get(key)!.entries.push(entry);
    }
    const ring = (entry: typeof entries[number]) => {
        const ssh = /^ssh\/([^:]+):/.exec(entry.model ?? '')?.[1] ?? /^ssh\.(.+)\.[^.]+$/.exec(entry.account)?.[1];
        const gateway = entry.provider === "oneapi" ? opts.gateway : null;
        const unavailable = entry.quotaStatus === "unavailable";
        const stale = entry.quotaStatus === "stale";
        const parked = entry.parkedAgents > 0;
        const budget = entry.provider === "opencode" && entry.planType !== "Go subscription";
        const thresholds = entry.thresholds ?? opts.thresholds ?? { warnAt: 30, criticalAt: 60, alertAt: 75 };
        // Slots are provider response order, not periods. Only measured duration
        // identifies a period; missing durations remain explicitly unknown.
        const windows = Object.entries(entry.windows ?? {}).filter((entry): entry is [string, types.llm.UsageWindow] => entry[1] != null);
        const measured = (minutes: number) => {
            if (unavailable || budget) return undefined;
            return windows.find(([, w]) => {
                const duration = w.windowMinutes;
                const matches = duration == null ? false : minutes === 43200
                    ? duration >= 40320 && duration <= 44640 : duration === minutes;
                return matches && Number.isFinite(w.usedPercent) && (!w.resetsAt || w.resetsAt > now);
            })?.[1];
        };
        const periods = [
            { key: "5h", label: "5 ч", detail: "5h", window: measured(300) },
            { key: "weekly", label: "Неделя", detail: "Weekly", window: measured(10080) },
            { key: "monthly", label: "Месяц", detail: "Monthly", window: measured(43200) },
        ];
        const ruStamp = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
        const rows = periods.map(p => {
            const percent = p.window ? Math.max(0, Math.min(100, p.window.usedPercent)) : null;
            const canonicalTone = p.window && "tone" in p.window ? p.window.tone : undefined;
            const tone = unavailable || stale || percent == null ? "text-faint"
                : canonicalTone === "neutral" ? "text-success"
                : canonicalTone === "warning" ? "text-warning"
                : canonicalTone === "critical" ? "text-critical"
                : canonicalTone === "error" ? "text-error" : toneClass(percent, thresholds);
            const used = percent == null ? "no data" : `${Math.round(percent)}% used${stale ? " (last known)" : ""}`;
            const reset = p.window?.resetsAt;
            const stamp = reset && Number.isFinite(reset) ? `${ruStamp.format(new Date(reset))} UTC` : null;
            return { ...p, percent, tone, text: `${p.detail} ${used}${stamp ? ` · resets ${stamp}` : ""}`,
                html: `<span class="quota-tip-row ${tone}"><i class="quota-tip-dot" aria-hidden="true"></i><span class="quota-tip-name">${p.detail}</span><span>${used}</span>${stamp ? `<span class="quota-tip-reset">resets <time datetime="${new Date(reset!).toISOString()}" data-quota-reset-detail>${esc(stamp)}</time></span>` : ""}</span>` };
        });
        const status = [
            unavailable ? "quota unavailable — usage unknown" : stale ? "Устаревшие данные · stale quota snapshot" : "",
            entry.tone === "error" && !unavailable ? "Высокое использование квоты" : "",
            parked ? `${entry.parkedAgents} agent(s) parked` : "",
            budget ? entry.memberBudgetText ?? "Monthly member budget unavailable" : "",
        ].filter(Boolean);
        // Keep an unclassified quota accessible, without inventing its duration.
        if (!budget && !unavailable && !rows.some(r => r.window) && (!windows.length || windows.some(([, w]) => (w.windowMinutes == null ? true : ![300, 10080].includes(w.windowMinutes) && !(w.windowMinutes >= 40320 && w.windowMinutes <= 44640)) && (!w.resetsAt || w.resetsAt > now))) && entry.usedPercent != null && Number.isFinite(entry.usedPercent)) {
            status.push(`Quota ${Math.round(Math.max(0, Math.min(100, entry.usedPercent)))}% used${stale ? " (last known)" : ""} · период неизвестен`);
        }
        if (gateway) {
            const text = gateway.reason === "disabled" ? "disabled" : gateway.reason === "missing-key" ? "configured · key missing" : gateway.status;
            status.push(`Asoft LLM Gate · ${text}`, "quota not measured", `${gateway.models?.length ?? 0} in catalogue`);
            if (gateway.checkedAt && Number.isFinite(gateway.checkedAt)) status.push(`checked ${ruStamp.format(new Date(gateway.checkedAt))}`);
        }
        // Detailed status stays in the unchanged tooltip and accessible label.
        const head = `${entry.label}${entry.account !== "default" ? ` · ${entry.account}` : ""}${entry.planType ? ` · ${entry.planType}` : ""}`;
        const machine = entry.node ? `Hyper node ${entry.node}` : ssh ? `SSH ${ssh}` : null;
        const aria = [head, machine, ...rows.map(r => r.text), ...status].filter(Boolean).join(" · ");
        const tip = `<span class="quota-tip" popover="auto" aria-hidden="true"><span class="quota-tip-head">${esc(head)}</span>${machine ? `<span class="quota-tip-sub">${esc(machine)}</span>` : ""}${rows.map(r => r.html).join("")}${status.map(s => `<span class="quota-tip-row">${esc(s)}</span>`).join("")}</span>`;
        const accountLabel = gateway ? "Asoft LLM Gate" : ssh && entry.account.startsWith(`ssh.${ssh}.`) ? entry.account.slice(`ssh.${ssh}.`.length) : entry.account;
        const source = ssh ?? entry.node;
        const gateState = gateway?.reason === "disabled" ? "disabled" : gateway?.status === "available" ? "available" : gateway?.status === "unavailable" ? "unavailable" : "unknown";
        const gateSymbol = { available: "✓", unavailable: "!", unknown: "?", disabled: "−" }[gateState];
        return `<a href="/llms" class="quota-ring quota-matrix-card" ${ssh ? 'data-connection="ssh"' : entry.node ? 'data-connection="hyper"' : 'data-connection="local"'} ${gateway ? `data-gateway="oneapi" data-status="${esc(gateway.status)}"` : ""} ${budget ? 'data-member-budget="opencode"' : ''} aria-label="${esc(aria)}">
            <span class="quota-matrix-provider"><span class="quota-matrix-logo" aria-hidden="true">${gateway ? `<i class="ph ph-plugs-connected" aria-hidden="true"></i>` : ctx.fns.ui.modelLogo({ model: entry.model ?? `${entry.provider}:`, bare: true, compact: true })}</span>${source ? `<span class="quota-matrix-host" aria-hidden="true">${esc(source.slice(0, 3))}</span>` : ''}<span class="quota-matrix-name">${esc(entry.label)}</span></span>
            <span class="quota-matrix-account" aria-hidden="true">${esc(accountLabel)}</span>
            ${gateway ? `<span class="quota-gateway-indicator" data-health="${gateState}" aria-hidden="true">${gateSymbol}</span>` : `<span class="quota-matrix-periods">${rows.map(r => `<span class="quota-matrix-period" data-quota-window="${r.key}"><span>${r.label}</span><strong class="${r.tone}" aria-label="${r.percent == null ? "Нет данных" : `${Math.round(r.percent)}% использовано`}">${r.percent == null ? "—" : Math.round(r.percent)}</strong></span>`).join("")}</span>`}${tip}
        </a>`;
    };
    const grouped = [...groups.entries()].sort(([a], [b]) => a === 'local' ? -1 : b === 'local' ? 1 : a.localeCompare(b));
    const cards = grouped.flatMap(([, group]) => group.entries.map(entry => ring(entry)));
    return `<div class="quota-matrix w-full" role="group" aria-label="Subscription quota"><div class="quota-matrix-legend" aria-hidden="true">5 ч · Нед. · Мес. <span>использовано, %</span></div><div class="quota-matrix-grid">${cards.join("")}</div></div>`;
}
