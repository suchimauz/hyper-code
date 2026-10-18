// The quota indicator: one ring per subscription credential, filled by how much
// of the window is spent. A ring is readable at a glance in a way a number is
// not — the point is noticing 87% before the work stops, not reading it after.
/** Renders subscription quota rings for the navigation panel. */
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

    const rings = entries.map((entry) => {
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
        const title = [
            `${entry.label}${entry.planType ? ` · ${entry.planType}` : ""}`,
            entry.node ? `Hyper node ${entry.node} · provider ${entry.provider} · account ${entry.account}` : null,
            known ? `${percent}% used${entry.quotaStatus === "stale" ? " (last known)" : ""}` : null,
            verdict,
            left ? `resets in ${left}` : null,
            `Provider ${entry.provider} · account ${entry.account}${entry.node ? ` · node ${entry.node}` : " · local"}`,
            entry.models?.length ? `\nAvailable models (${entry.models.length}):\n${entry.models.join("\n")}` : null,
        ].filter(Boolean).join(" · ");

        return `<a href="/llms" class="flex flex-col items-center gap-0.5 rounded-md px-0.5 py-1 hover:bg-base-300" title="${esc(title)}" aria-label="${esc(title)}">
          <span class="relative flex size-7 shrink-0 items-center justify-center ${colour}">
            <svg viewBox="0 0 28 28" class="absolute size-7 -rotate-90" aria-hidden="true">
              <circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" stroke-width="2" opacity="0.18"></circle>
              ${known ? `<circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="${filled.toFixed(1)} ${circumference}"></circle>` : ""}
            </svg>
            ${parked
            ? `<i class="ph ph-pause text-2xs" aria-hidden="true"></i>`
            : ctx.fns.ui.modelLogo({ model: entry.model ?? `${entry.provider}:`, bare: true })}
            ${entry.node ? `<i class="ph ph-arrows-left-right absolute -bottom-0.5 -right-0.5 rounded-full bg-base-100 text-[8px] leading-none" aria-hidden="true"></i>` : ""}
          </span>
          ${entry.node ? `<span class="block max-w-8 truncate text-[8px] leading-tight" aria-hidden="true">${esc(entry.node)}</span>` : ""}
        </a>`;
    }).join("");

    return `<div class="flex flex-col items-center gap-0.5 border-t border-ui-border pt-1" role="group" aria-label="Subscription quota">${rings}</div>`;
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
