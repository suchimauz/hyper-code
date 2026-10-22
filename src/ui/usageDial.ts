// The quota indicator: one ring per subscription credential, filled by how much
// of the window is spent. A ring is readable at a glance in a way a number is
// not — the point is noticing 87% before the work stops, not reading it after.
/** Renders compact quota groups by local machine, Hyper node or SSH instance, with equal-height provider rings. */
/**
 * Render a compact ring per subscription credential showing spent quota.
 *
 * Colour follows the fill: neutral below 60%, warning to 85%, error above, and
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
            /** Available catalogue model IDs for this provider/account; shown in the native tooltip. */
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
        }>;
        /** Current timestamp in ms; defaults to Date.now(). */
        now?: number;
    },
): string {
    const esc = (s: any) => ctx.fns.procs.ui.escape({ text: s });
    const entries = opts.entries ?? [];
    if (!entries.length) return "";
    const now = opts.now ?? Date.now();

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
        const known = entry.usedPercent != null && Number.isFinite(entry.usedPercent);
        const parked = entry.parkedAgents > 0;
        const colour = parked || entry.tone === "error" ? "text-error"
            : entry.tone === "warning" ? "text-warning"
                : "text-faint";
        // A stroke-dasharray on a circle of r=12 (circumference ≈ 75.4) needs no
        // JS and no layout: the fill IS the number.
        const circumference = 75.4;
        const filled = known ? (percent / 100) * circumference : 0;
        const left = entry.resetsAt ? humanDelay(entry.resetsAt - now) : null;
        // What the number MEANS, spelled out: how much is left, until when, and
        // what happens next. A bare "78%" answers none of those.
        const remaining = known ? Math.max(0, 100 - percent) : null;
        const verdict = entry.quotaStatus === "unavailable"
            ? "quota unavailable — usage unknown"
            : entry.quotaStatus === "stale"
                ? "stale quota snapshot — current usage unknown"
                : !known
            ? "no data yet — available after the first model response"
            : parked
                ? `quota exhausted · ${entry.parkedAgents} agent(s) parked`
                : entry.tone === "error"
                    ? `${remaining}% remaining — consider switching models before a long task`
                    : entry.tone === "warning"
                        ? `${remaining}% remaining`
                        : `${remaining}% remaining — sufficient capacity`;
        const dual = entry.provider === "zai-coding" || entry.provider === "minimax-coding";
        const freshWindow = (window?: types.llm.UsageWindow) => window && Number.isFinite(window.usedPercent) && (!window.resetsAt || window.resetsAt > now) ? window : undefined;
        const short = freshWindow(entry.windows?.primary);
        const weekly = freshWindow(entry.windows?.secondary);
        const windowTitle = (label: string, window?: types.llm.UsageWindow) => `${label}: ${window ? `${window.usedPercent}% used · ${Math.max(0, 100-window.usedPercent)}% remaining${window.resetsAt ? ` · resets in ${humanDelay(window.resetsAt-now)} (${new Date(window.resetsAt).toISOString()})` : ""}` : "quota unavailable"}`;
        const quotaCircle = (radius: number, window: types.llm.UsageWindow | undefined, label: string, colour: string) => {
            const length = 2 * Math.PI * radius;
            const percent = window ? Math.max(0, Math.min(100, window.usedPercent)) : null;
            const tone = entry.quotaStatus === "stale" ? "text-faint" : percent != null && percent >= 85 ? "text-error" : percent != null && percent >= 60 ? "text-warning" : colour;
            return `<g data-quota-window="${label}" class="${tone}"><circle cx="14" cy="14" r="${radius}" fill="none" stroke="currentColor" stroke-width="1.7" opacity="0.18"></circle>${percent == null ? "" : `<circle cx="14" cy="14" r="${radius}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-dasharray="${(length*percent/100).toFixed(2)} ${length.toFixed(2)}"></circle>`}</g>`;
        };
        const dualSvg = dual ? `<svg viewBox="0 0 28 28" class="absolute size-7 -rotate-90" aria-hidden="true">${quotaCircle(12,weekly,"weekly","text-info")}${quotaCircle(9,short,"5h","text-success")}</svg>` : "";

        const title = [
            `${entry.label}${entry.planType ? ` · ${entry.planType}` : ""}`,
            entry.node ? `Hyper node ${entry.node} · provider ${entry.provider} · account ${entry.account}` : null,
            known ? `${percent}% used${entry.quotaStatus === "stale" ? " (last known)" : ""}` : null,
            verdict,
            dual ? `Outer ring · ${windowTitle("Weekly",weekly)}\nInner ring · ${windowTitle("5h",short)}` : null,
            left ? `resets in ${left}` : null,
            `Provider ${entry.provider} · account ${entry.account}${entry.node ? ` · node ${entry.node}` : ssh ? ` · SSH ${ssh}` : " · local"}`,
            entry.models?.length ? `\nAvailable models (${entry.models.length}):\n${entry.models.join("\n")}` : null,
        ].filter(Boolean).join(" · ");

        return `<a href="/llms" class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-base-300" title="${esc(title)}" aria-label="${esc(title)}">
          <span class="relative flex size-7 shrink-0 items-center justify-center ${colour}">
            ${dual ? dualSvg : `<svg viewBox="0 0 28 28" class="absolute size-7 -rotate-90" aria-hidden="true">
              <circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" stroke-width="2" opacity="0.18"></circle>
              ${known ? `<circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="${filled.toFixed(1)} ${circumference}"></circle>` : ""}
            </svg>`}
            ${parked
            ? `<i class="ph ph-pause text-2xs" aria-hidden="true"></i>`
            : ctx.fns.ui.modelLogo({ model: entry.model ?? (entry.node ? `hyper/${entry.node}:${entry.provider}:` : ssh ? `ssh/${ssh}:${entry.provider}:` : `${entry.provider}:`), bare: true, ...(dual ? { compact: true } : {}) })}
          </span>
        </a>`;
    };
    const grouped = [...groups.entries()].sort(([a], [b]) => a === 'local' ? -1 : b === 'local' ? 1 : a.localeCompare(b));
    const showHeadings = groups.size > 1 || !groups.has('local');
    const html = grouped.map(([key, group]) => `<section data-quota-group="${esc(key)}" aria-label="${esc(group.label)}" class="min-w-0">${showHeadings ? `<h3 class="truncate px-1 text-[9px] font-medium leading-3 text-faint" title="${esc(group.label)}">${esc(group.label)}</h3>` : ''}<div class="flex flex-wrap items-center gap-0.5">${group.entries.map(ring).join('')}</div></section>`).join('');
    return `<div class="w-full border-t border-ui-border pt-1" role="group" aria-label="Subscription quota"><div class="w-full min-w-0 space-y-1">${html}</div></div>`;
}

function humanDelay(ms: number): string {
    const left = Math.max(0, ms);
    const minutes = Math.floor(left / 60_000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days >= 1) return `${days}d ${hours % 24}h`;
    if (hours >= 1) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
}
