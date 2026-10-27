/**
 * Render a scheduled automation event as a collapsed, escaped prompt card
 *
 * Use for scheduled wake_up events without watchId or user events explicitly tagged automationKind scheduled. Returns empty markup for unrelated events. Keeps the full prompt inside native details without changing transcript data.
 * @param opts.event Durable scheduled event with its complete prompt and optional schedule identity.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Durable scheduled event with its complete prompt and optional schedule identity. */
        event: { type: string; automationKind?: string; watchId?: string; reason?: string; summary?: string; text?: string; content?: string; scheduleId?: string; triggerId?: string };
    },
): Promise<string> {
    const ev = opts.event;
    if (!(ev.type === "wake_up" && !ev.watchId) && !(["user", "user_message"].includes(ev.type) && ev.automationKind === "scheduled")) return "";
    const esc = (value: string) => Bun.escapeHTML(value);
    const prompt = ev.reason ?? ev.text ?? ev.content ?? ev.summary ?? "";
    const identity = ev.scheduleId ?? ev.triggerId;
    return `<details class="service-message service-automation"><summary class="service-toggle"><span class="service-heading"><span class="service-mark"><i class="ph ph-alarm" aria-hidden="true"></i></span><span class="service-title">Запуск по расписанию</span><i class="ph ph-caret-down service-chevron" aria-hidden="true"></i></span></summary><div class="service-body">${identity ? `<div class="service-meta">Расписание: ${esc(identity)}</div>` : ""}<pre class="service-fulltext"><span>${esc(prompt)}</span></pre></div><button type="button" class="service-collapse" data-service-collapse>Свернуть</button></details>`;
}
