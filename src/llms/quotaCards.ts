/**
 * Render subscription quota cards from reported usage windows.
 *
 * Pure HTML rendering for /llms without network or clock reads. Labels use the reported windowMinutes, never the primary/secondary slot. Missing durations and invalid percentages remain explicitly unknown; reported windows take precedence over aggregate usage.
 * @param opts.account Exact account usage fields accepted by accountsCard. Availability never implies zero usage; thresholds control severity colors.
 * @param opts.now Optional current epoch milliseconds to annotate elapsed resets; omitted renders only absolute reset times.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact account usage fields accepted by accountsCard. Availability never implies zero usage; thresholds control severity colors. */
        account: { usedPercent: number | null; resetsAt: number | null; windows?: types.llm.UsageSnapshot["windows"] | null; available: boolean; thresholds?: { warnAt: number; criticalAt?: number; alertAt: number } };
        /** Optional current epoch milliseconds to annotate elapsed resets; omitted renders only absolute reset times. */
        now?: number;
    },
): string {
    const { account, now } = opts;
    const escape = (text: string) => Bun.escapeHTML(text);
    const valid = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
    const threshold = (n: number | undefined, fallback: number) => valid(n) ? n : fallback;
    const warn = threshold(account.thresholds?.warnAt, 30);
    const critical = threshold(account.thresholds?.criticalAt, 60);
    const alert = threshold(account.thresholds?.alertAt, 75);
    const entries: Array<{ label: string; usedPercent: number | null; resetsAt?: number | null }> = [];
    const periodLabel = (minutes: number | null | undefined): string => {
        if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return 'Период неизвестен';
        if (minutes === 300) return '5 часов';
        if (minutes === 10080) return 'Неделя';
        if (minutes === 43200) return 'Месяц';
        if (minutes % 1440 === 0) return `${minutes / 1440} дн.`;
        if (minutes % 60 === 0) return `${minutes / 60} ч`;
        return `${minutes} мин`;
    };
    for (const key of ['primary', 'secondary', 'tertiary'] as const) {
        const window = account.windows?.[key];
        if (window) entries.push({ label: periodLabel(window.windowMinutes), usedPercent: window.usedPercent, resetsAt: window.resetsAt });
    }
    if (!entries.length) entries.push({ label: 'Текущий лимит', usedPercent: account.usedPercent, resetsAt: account.resetsAt });
    return '<div class="llm-quota-grid">' + entries.map(entry => {
     const percent = valid(entry.usedPercent) ? entry.usedPercent : null;
     const color = percent === null ? '' : percent >= alert ? 'text-error' : percent >= critical ? 'text-critical' : percent >= warn ? 'text-warning' : 'text-success';
     const value = percent === null ? '—' : String(Math.round(percent * 10) / 10) + '%';
     const stamp = entry.resetsAt;
     const date = typeof stamp === 'number' && Number.isFinite(stamp) && stamp > 0 ? new Date(stamp) : null;
     const iso = date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
     const elapsed = iso && typeof now === 'number' && Number.isFinite(now) && (stamp as number) <= now;
     const reset = iso ? 'Сброс: <time data-llm-local-time datetime="' + escape(iso) + '">' + escape(iso.slice(0,16).replace('T',' ') + ' UTC') + '</time>' + (elapsed ? ' · ожидается обновление' : '') : 'Сброс: нет данных';
     const meter = percent === null ? '<div class="llm-quota-meter" aria-hidden="true"><span style="width:0%;background:currentColor"></span></div>' : '<div class="llm-quota-meter" role="meter" aria-label="' + escape(entry.label + ': израсходовано') + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"><span style="width:' + percent + '%;background:currentColor"></span></div>';
     return '<div class="llm-quota-card' + (color ? ' ' + color : '') + '"><div class="llm-quota-label">' + escape(entry.label) + '</div><div class="llm-quota-value">' + escape(value) + '</div><div class="llm-quota-caption">' + (percent === null ? 'Нет данных' : 'Израсходовано') + '</div>' + meter + '<div class="llm-quota-reset">' + reset + '</div></div>';
    }).join('') + '</div>';
}
