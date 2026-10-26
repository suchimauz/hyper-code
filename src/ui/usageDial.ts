/**
 * Render a provider/account quota matrix grouped by local machine, Hyper node or SSH.
 * Shows measured five-hour, weekly and monthly periods together; missing or expired
 * measurements remain explicitly unknown. Generic quota is shown with an explicit unknown-period label.
 * Keeps provider reset timestamps in the tooltip, localized by the browser.
 * Returns empty markup when there are no connections. Uses shared severity thresholds.
 * @param opts.entries Connection snapshots from llms.usageData.
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
        // Most providers normalize named periods to semantic slots. Codex slots
        // are ordered by the upstream response, not by duration: primary may be
        // weekly. Never infer five hours (or a week) from an unlabelled Codex slot.
        const windows = Object.entries(entry.windows ?? {}).filter((entry): entry is [string, types.llm.UsageWindow] => entry[1] != null);
        const measured = (slot: string, minutes: number) => {
            if (unavailable || budget) return undefined;
            return windows.find(([key, w]) => {
                const duration = w.windowMinutes;
                const matches = duration == null ? entry.provider !== "codex" && key === slot : minutes === 43200
                    ? duration >= 40320 && duration <= 44640 : duration === minutes;
                return matches && Number.isFinite(w.usedPercent) && (!w.resetsAt || w.resetsAt > now);
            })?.[1];
        };
        const periods = [
            { key: "5h", label: "5 ч", detail: "5h", window: measured("primary", 300) },
            { key: "weekly", label: "Неделя", detail: "Weekly", window: measured("secondary", 10080) },
            { key: "monthly", label: "Месяц", detail: "Monthly", window: measured("tertiary", 43200) },
        ];
        const ruStamp = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
        const rows = periods.map(p => {
            const percent = p.window ? Math.max(0, Math.min(100, p.window.usedPercent)) : null;
            const tone = unavailable || stale ? "text-faint" : toneClass(percent, thresholds);
            const used = percent == null ? "no data" : `${Math.round(percent)}% used${stale ? " (last known)" : ""}`;
            const reset = p.window?.resetsAt;
            const stamp = reset && Number.isFinite(reset) ? `${ruStamp.format(new Date(reset))} UTC` : null;
            return { ...p, percent, tone, text: `${p.detail} ${used}${stamp ? ` · resets ${stamp}` : ""}`,
                html: `<span class="quota-tip-row ${tone}"><i class="quota-tip-dot" aria-hidden="true"></i><span class="quota-tip-name">${p.detail}</span><span>${used}</span>${stamp ? `<span class="quota-tip-reset">resets <time datetime="${new Date(reset!).toISOString()}" data-quota-reset-detail>${esc(stamp)}</time></span>` : ""}</span>` };
        });
        const status = [
            unavailable ? "quota unavailable — usage unknown" : stale ? "Устаревшие данные · stale quota snapshot" : "",
            entry.tone === "error" ? "Ошибка квоты" : "",
            parked ? `${entry.parkedAgents} agent(s) parked` : "",
            budget ? entry.memberBudgetText ?? "Monthly member budget unavailable" : "",
        ].filter(Boolean);
        // Keep an unclassified quota accessible, without inventing its duration.
        if (!budget && !unavailable && !rows.some(r => r.window) && (!windows.length || windows.some(([, w]) => (w.windowMinutes == null ? entry.provider === "codex" : ![300, 10080].includes(w.windowMinutes) && !(w.windowMinutes >= 40320 && w.windowMinutes <= 44640)) && (!w.resetsAt || w.resetsAt > now))) && entry.usedPercent != null && Number.isFinite(entry.usedPercent)) {
            status.push(`Quota ${Math.round(Math.max(0, Math.min(100, entry.usedPercent)))}% used${stale ? " (last known)" : ""} · период неизвестен`);
        }
        if (gateway) {
            const text = gateway.reason === "disabled" ? "disabled" : gateway.reason === "missing-key" ? "configured · key missing" : gateway.status;
            status.push(`Asoft LLM Gate · ${text}`, "quota not measured", `${gateway.models?.length ?? 0} in catalogue`);
            if (gateway.checkedAt && Number.isFinite(gateway.checkedAt)) status.push(`checked ${ruStamp.format(new Date(gateway.checkedAt))}`);
        }
        const generic = status.find(s => s.includes("период неизвестен"));
        // Details stay in the accessible label and popover. A narrow matrix column
        // must not turn gateway metadata or an error into a paragraph below its rows.
        const statusIcon = entry.tone === "error" ? "warning-circle" : unavailable ? "question" : stale ? "clock" : gateway ? (gateway.status === "available" ? "check-circle" : "info") : null;
        const compactStatus = [statusIcon ? `<i class="ph ph-${statusIcon}" aria-hidden="true"></i>` : "", parked ? `Ⅱ ${entry.parkedAgents}` : "", budget ? "PAYG" : ""].filter(Boolean).join(" ");
        const head = `${entry.label}${entry.account !== "default" ? ` · ${entry.account}` : ""}${entry.planType ? ` · ${entry.planType}` : ""}`;
        const machine = entry.node ? `Hyper node ${entry.node}` : ssh ? `SSH ${ssh}` : null;
        const aria = [head, machine, ...rows.map(r => r.text), ...status].filter(Boolean).join(" · ");
        const tip = `<span class="quota-tip" popover="auto" aria-hidden="true"><span class="quota-tip-head">${esc(head)}</span>${machine ? `<span class="quota-tip-sub">${esc(machine)}</span>` : ""}${rows.map(r => r.html).join("")}${status.map(s => `<span class="quota-tip-row">${esc(s)}</span>`).join("")}</span>`;
        return `<a href="/llms" class="quota-ring quota-matrix-card" ${gateway ? `data-gateway="oneapi" data-status="${esc(gateway.status)}"` : ""} ${budget ? 'data-member-budget="opencode"' : ''} aria-label="${esc(aria)}">
            <span class="quota-matrix-provider"><span class="quota-matrix-logo" aria-hidden="true">${gateway ? `<i class="ph ph-plugs-connected" aria-hidden="true"></i>` : ctx.fns.ui.modelLogo({ model: entry.model ?? `${entry.provider}:`, bare: true, compact: true })}</span><span class="quota-matrix-name">${esc(entry.label)}${entry.account !== "default" ? `<span class="quota-matrix-account">${esc(entry.account)}</span>` : ""}</span></span>
            <span class="quota-matrix-periods">${generic && entry.provider !== "codex" ? `<span class="quota-matrix-unknown ${toneClass(entry.usedPercent, thresholds)}">${Math.round(Math.max(0, Math.min(100, entry.usedPercent!)))}%<br>период<br>неизв.</span>` : rows.map(r => `<span class="quota-matrix-period" data-quota-window="${r.key}" style="grid-row:${r.key === '5h' ? 1 : r.key === 'weekly' ? 2 : 3}"><span>${r.label}</span><strong class="${r.tone}" aria-label="${r.percent == null ? "Нет данных" : `${Math.round(r.percent)}% использовано`}">${r.percent == null ? "—" : Math.round(r.percent)}</strong><span class="quota-matrix-bar ${r.tone}" aria-hidden="true"><span style="width:${r.percent ?? 0}%"></span></span></span>`).join("")}</span>
            ${compactStatus ? `<span class="quota-matrix-status" aria-hidden="true">${compactStatus}</span>` : ""}${tip}
        </a>`;
    };
    const grouped = [...groups.entries()].sort(([a], [b]) => a === 'local' ? -1 : b === 'local' ? 1 : a.localeCompare(b));
    const flat = grouped.flatMap(([key, group]) => group.entries.map(entry => ({key, label: group.label, entry})));
    const bands: string[] = [];
    for (let i = 0; i < flat.length; i += 6) {
        const chunk = flat.slice(i, i + 6);
        const segments: Array<{key: string; label: string; count: number}> = [];
        for (const row of chunk) {
            const last = segments.at(-1);
            if (last?.key === row.key) last.count++;
            else segments.push({key: row.key, label: row.label, count: 1});
        }
        bands.push(`<div class="quota-matrix-band"><div class="quota-matrix-labels" aria-hidden="true"><span class="quota-matrix-label-spacer"></span><span>5 ч</span><span>Нед.</span><span>Мес.</span></div><div class="quota-matrix-band-content"><div class="quota-matrix-sources">${segments.map(g => `<h3 data-quota-group="${esc(g.key)}" class="quota-matrix-heading" style="grid-column:span ${g.count}">${esc(g.label)}</h3>`).join("")}</div><div class="quota-matrix-grid">${chunk.map(r => ring(r.entry)).join("")}</div></div></div>`);
    }
    return `<div class="quota-matrix w-full" role="group" aria-label="Subscription quota">${bands.join("")}</div>`;
}
