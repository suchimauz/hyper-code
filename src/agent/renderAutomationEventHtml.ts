/**
 * Render scheduled and one-time trigger prompts with visible identity, saved schedule metadata and a short preview.
 *
 * Use for non-watch wake_up events and explicitly scheduled user events. Cron, time zone and kind come only from the persisted event snapshot; historical rows with missing kind are labelled generically. Native details preserves the complete original prompt without adding transcript messages.
 * @param opts.event Durable automation event with the original prompt and optional snapshot of trigger kind, cron and time zone.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Durable automation event with the original prompt and optional snapshot of trigger kind, cron and time zone. */
        event: { type: string; ts?: number; automationKind?: string; watchId?: string; triggerKind?: string; cronExpression?: string; timezone?: string; prompt?: string; reason?: string; summary?: string; text?: string; content?: string; scheduleId?: string; triggerId?: string };
    },
): Promise<string> {
    const ev = opts.event;
    if (ev.watchId || ev.triggerKind === 'watch') return '';
    if (ev.type !== 'wake_up' && !(['user', 'user_message'].includes(ev.type) && ev.automationKind === 'scheduled')) return '';
    const esc = (value: string) => Bun.escapeHTML(value);
    const prompt = ev.prompt ?? ev.reason ?? ev.text ?? ev.content ?? ev.summary ?? '';
    const identity = ev.scheduleId ?? ev.triggerId;
    const isCron = ev.triggerKind === 'cron' || (!ev.triggerKind && (ev.automationKind === 'scheduled' || !!ev.cronExpression));
    const oneTime = ev.triggerKind === 'at';
    const title = oneTime ? 'Разовый запуск' : isCron ? 'Запуск по расписанию' : 'Автоматический запуск';
    const date = new Date(ev.ts ?? NaN);
    const time = Number.isFinite(date.getTime()) ? `<time datetime="${date.toISOString()}" title="${esc(date.toLocaleString('ru-RU'))}">${esc(date.toLocaleString('ru-RU', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))}</time>` : '';
    const metadata = `${identity ? `<span>ID задачи <code>${esc(identity)}</code></span>` : ''}${isCron && ev.cronExpression ? `<span>Cron <code>${esc(ev.cronExpression)}</code></span>` : ''}${ev.timezone ? `<span>${esc(ev.timezone)}</span>` : ''}`;
    const legacy = !ev.triggerKind && !isCron ? '<div class="service-meta">Тип запуска не сохранён в этой записи.</div>' : '';
    return `<details class="service-message service-automation" data-trigger-kind="${esc(ev.triggerKind ?? (isCron ? 'scheduled' : 'unknown'))}"><summary class="service-toggle"><span class="service-heading"><span class="service-mark"><i class="ph ph-${oneTime ? 'clock' : 'alarm'}" aria-hidden="true"></i></span><span class="service-identity"><span class="service-title">${title}</span><span class="service-meta service-schedule-meta">${metadata}</span></span><i class="ph ph-caret-down service-chevron" aria-hidden="true"></i></span><span class="service-preview">${esc(prompt.slice(0, 1000))}</span><span class="service-hint">${time}${time ? ' · ' : ''}Раскрыть полный промпт</span></summary><div class="service-body">${legacy}<pre class="service-fulltext"><span>${esc(prompt)}</span></pre></div><button type="button" class="service-collapse" data-service-collapse data-no-copy>Свернуть</button></details>`;
}
