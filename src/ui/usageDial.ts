// The quota indicator: one ring per subscription credential, filled by how much
// of the window is spent. A ring is readable at a glance in a way a number is
// not — the point is noticing 87% before the work stops, not reading it after.
/** Renders compact quota groups by local machine, Hyper node or SSH instance, with equal-height provider rings. */
/**
 * Render a compact ring per subscription credential showing spent quota.
 *
 * Colour follows configured thresholds (50% warning / 75% alert by default), and
 * a full ring with a pause icon once agents are parked on it. Returns an empty
 * string when nothing has been recorded yet.
 *
 * @param opts.entries Snapshot rows from llm.usageOverview.
 * @param opts.now Current time in ms, for testing.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Local usage snapshots and node/provider/account snapshots, with optional freshness status. */
        entries: Array<{
            provider: string;
            account: string;
            label: string;
            model?: string;
            /** Available catalogue model IDs for this provider/account; the full list lives on /llms, not in the hover card. */
            models?: string[];
            /** Short (5h) and long (weekly) windows; Z.ai renders these as concentric rings. */
            windows?: types.llm.UsageSnapshot["windows"];
            /** Hyper node name for remote credentials; omitted for local credentials. */
            node?: string;
            /** Remote snapshot is outdated or has no measured quota; omitted for current data. */
            quotaStatus?: "stale" | "unavailable";
            usedPercent: number | null;
            resetsAt: number | null;
            planType: string | null;
            parkedAgents: number;
            tone: "neutral" | "warning" | "error";
            /** Shared quota colour thresholds from usageOverview. */
            thresholds?: { warnAt: number; alertAt: number };
        }>;
        /** Current timestamp in ms; defaults to Date.now(). */
        now?: number;
        /**
         * Quota thresholds shared with every other usage surface.
         * Defaults to the settings' own values (50% warning, 75% alert).
         */
        thresholds?: { warnAt: number; alertAt: number };
    },
): string {
    const esc = (s: any) => ctx.fns.procs.ui.escape({ text: s });
    const entries = opts.entries ?? [];
    if (!entries.length) return "";
    const now = opts.now ?? Date.now();
    const toneClass = (percent: number | null, thresholds: { warnAt: number; alertAt: number }) => percent == null || !Number.isFinite(percent) ? "text-faint" : percent >= thresholds.alertAt ? "text-error" : percent >= thresholds.warnAt ? "text-warning" : "text-success";

    const groups = new Map<string, { label: string; entries: typeof entries }>();
    for (const entry of entries) {
        const ssh = /^ssh\/([^:]+):/.exec(entry.model ?? '')?.[1] ?? /^ssh\.(.+)\.[^.]+$/.exec(entry.account)?.[1];
        const key = entry.node ? `hyper/${entry.node}` : ssh ? `ssh/${ssh}` : 'local';
        const label = entry.node ? `Hyper · ${entry.node}` : ssh ? `SSH · ${ssh}` : 'Local';
        if (!groups.has(key)) groups.set(key, { label, entries: [] });
        groups.get(key)!.entries.push(entry);
    }
    const ring = (entry: typeof entries[number]) => {
        const ssh = /^ssh\/([^:]+):/.exec(entry.model ?? '')?.[1] ?? /^ssh\.(.+)\.[^.]+$/.exec(entry.account)?.[1];
        const percent = entry.usedPercent == null ? 0 : Math.max(0, Math.min(100, entry.usedPercent));
        const known = entry.quotaStatus !== "unavailable" && entry.usedPercent != null && Number.isFinite(entry.usedPercent);
        const parked = entry.parkedAgents > 0;
        const thresholds = entry.thresholds ?? opts.thresholds ?? { warnAt: 50, alertAt: 75 };
        const unavailable = entry.quotaStatus === "unavailable";
        const muted = unavailable || entry.quotaStatus === "stale";
        const colour = parked ? "text-error" : muted ? "text-faint" : toneClass(known ? percent : null, thresholds);
        // A stroke-dasharray on a circle of r=12 (circumference ≈ 75.4) needs no
        // JS and no layout: the fill IS the number.
        const circumference = 75.4;
        const filled = known ? (percent / 100) * circumference : 0;
        // Two rings when the provider reports two rolling windows: the weekly
        // one outside, the short one inside. Driven by the measured windows,
        // not by a list of providers — otherwise a plan that reports a weekly
        // window would still show one ring.
        const freshWindow = (window?: types.llm.UsageWindow) => window && Number.isFinite(window.usedPercent) && (!window.resetsAt || window.resetsAt > now) ? window : undefined;
        const short = unavailable ? undefined : freshWindow(entry.windows?.primary);
        const weekly = unavailable ? undefined : freshWindow(entry.windows?.secondary);
        const dual = Boolean(entry.windows?.secondary) || entry.provider === "zai-coding" || entry.provider === "minimax-coding";
        const quotaCircle = (radius: number, window: types.llm.UsageWindow | undefined, label: string) => {
            const length = 2 * Math.PI * radius;
            const percent = window ? Math.max(0, Math.min(100, window.usedPercent)) : null;
            // The same severity rule as every other usage surface.
            const tone = parked ? "text-error" : muted ? "text-faint" : toneClass(percent, thresholds);
            return `<g data-quota-window="${label}" class="${tone}"><circle cx="14" cy="14" r="${radius}" fill="none" stroke="currentColor" stroke-width="1.7" opacity="0.18"></circle>${percent == null ? "" : `<circle cx="14" cy="14" r="${radius}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-dasharray="${(length*percent/100).toFixed(2)} ${length.toFixed(2)}"></circle>`}</g>`;
        };
        const dualSvg = dual ? `<svg viewBox="0 0 28 28" class="absolute size-7 -rotate-90" aria-hidden="true">${quotaCircle(12,weekly,"weekly")}${quotaCircle(9,short,"5h")}</svg>` : "";

        // The hover card keeps only what the eye came for — the name, the
        // limits and the reset moment. The model catalogue lives one click
        // away on /llms; a tooltip is not the place for a wall of model IDs.
        // Reset moments are rendered in the Russian short format, without
        // seconds: "21 окт., 15:30".
        const ruStamp = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
        const resetStamp = (ms: number | null | undefined) => (ms && Number.isFinite(ms) ? ruStamp.format(new Date(ms)) : null);
        const tipRow = (name: string, usedPercent: number | null, resetsAt: number | null) => {
            const tone = parked ? "text-error" : muted ? "text-faint" : toneClass(usedPercent, thresholds);
            const stamp = resetStamp(resetsAt);
            const used = usedPercent == null ? "no data" : `${Math.round(usedPercent)}% used${entry.quotaStatus === "stale" ? " (last known)" : ""}`;
            return {
                tone,
                text: stamp ? `${name} ${used} · resets ${stamp}` : `${name} ${used}`,
                html: `<span class="quota-tip-row ${tone}"><i class="quota-tip-dot" aria-hidden="true"></i><span class="quota-tip-name">${esc(name)}</span><span>${esc(used)}</span>${stamp ? `<span class="quota-tip-reset">resets ${esc(stamp)}</span>` : ""}</span>`,
            };
        };
        const rows = unavailable
            ? [{ tone: "text-faint", text: "quota unavailable — usage unknown", html: `<span class="quota-tip-row text-faint"><i class="quota-tip-dot" aria-hidden="true"></i><span>quota unavailable — usage unknown</span></span>` }]
            : dual
                ? [tipRow("5h", short?.usedPercent ?? null, short?.resetsAt ?? null), tipRow("Weekly", weekly?.usedPercent ?? null, weekly?.resetsAt ?? null)]
                : [tipRow("Quota", known ? percent : null, entry.resetsAt)];
        if (parked) rows.push({ tone: "text-error", text: `${entry.parkedAgents} agent(s) parked`, html: `<span class="quota-tip-row text-error"><i class="ph ph-pause" aria-hidden="true"></i><span>${entry.parkedAgents} agent(s) parked</span></span>` });
        const head = `${entry.label}${entry.planType ? ` · ${entry.planType}` : ""}`;
        const machine = entry.node ? `Hyper node ${entry.node}` : ssh ? `SSH ${ssh}` : null;
        const aria = [head, machine, ...rows.map((row: { tone: string; text: string; html: string }) => row.text)].filter(Boolean).join(" · ");
        const tip = `<span class="quota-tip" popover="auto" aria-hidden="true"><span class="quota-tip-head">${esc(head)}</span>${machine ? `<span class="quota-tip-sub">${esc(machine)}</span>` : ""}${rows.map((row: { tone: string; text: string; html: string }) => row.html).join("")}</span>`;

        return `<a href="/llms" class="quota-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-base-300" aria-label="${esc(aria)}">
          <span class="relative flex size-7 shrink-0 items-center justify-center ${colour}">
            ${dual ? dualSvg : `<svg viewBox="0 0 28 28" class="absolute size-7 -rotate-90" aria-hidden="true">
              <circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" stroke-width="2" opacity="0.18"></circle>
              ${known ? `<circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="${filled.toFixed(1)} ${circumference}"></circle>` : ""}
            </svg>`}
            ${parked
            ? `<i class="ph ph-pause text-2xs" aria-hidden="true"></i>`
            : ctx.fns.ui.modelLogo({ model: entry.model ?? (entry.node ? `hyper/${entry.node}:${entry.provider}:` : ssh ? `ssh/${ssh}:${entry.provider}:` : `${entry.provider}:`), bare: true, ...(dual ? { compact: true } : {}) })}
          </span>
          ${tip}
        </a>`;
    };
    const grouped = [...groups.entries()].sort(([a], [b]) => a === 'local' ? -1 : b === 'local' ? 1 : a.localeCompare(b));
    const showHeadings = groups.size > 1 || !groups.has('local');
    const html = grouped.map(([key, group]) => `<section data-quota-group="${esc(key)}" aria-label="${esc(group.label)}" class="min-w-0">${showHeadings ? `<h3 class="truncate px-1 text-[9px] font-medium leading-3 text-faint" title="${esc(group.label)}">${esc(group.label)}</h3>` : ''}<div class="flex flex-wrap items-center gap-0.5">${group.entries.map(ring).join('')}</div></section>`).join('');
    return `<div class="w-full border-t border-ui-border pt-1" role="group" aria-label="Subscription quota"><div class="w-full min-w-0 space-y-1">${html}</div></div>`;
}
