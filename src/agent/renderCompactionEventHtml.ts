/**
 * Render context compaction progress and outcomes as quiet expandable notices
 *
 * Use for compaction_start, compaction_completed and compaction_failed durable events. Shows a single Russian status line by default and escapes complete summary or error details without truncation. Does not coalesce events or mutate the transcript.
 * @param opts.event Compaction event including token counts, revision and complete summary or failure text.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Compaction event including token counts, revision and complete summary or failure text. */
        event: { type: string; revision?: number; tokensBefore?: number; tokensAfter?: number; keptMessages?: number; summary?: string; error?: string };
    },
): Promise<string> {
    const ev = opts.event;
    if (!["compaction_start", "compaction_completed", "compaction_failed"].includes(ev.type)) return "";
    const completed = ev.type === "compaction_completed", failed = ev.type === "compaction_failed";
    const esc = (value: string) => Bun.escapeHTML(value);
    const count = (value: number | undefined) => Number.isFinite(value) && Number(value) >= 0 ? Math.round(Number(value)) : 0;
    const title = completed ? "Контекст сжат" : failed ? "Не удалось сжать контекст" : "Сжимаю контекст";
    const metric = completed ? `${Math.round(count(ev.tokensBefore) / 1000)}k → ${Math.round(count(ev.tokensAfter) / 1000)}k` : failed ? "" : `v${count(ev.revision)}`;
    const facts = completed ? `<dl class="context-facts"><dt>До сжатия</dt><dd>${count(ev.tokensBefore).toLocaleString("ru-RU")} токенов</dd><dt>После сжатия</dt><dd>${count(ev.tokensAfter).toLocaleString("ru-RU")} токенов</dd><dt>Сохранено сообщений</dt><dd>${count(ev.keptMessages)}</dd><dt>Версия контекста</dt><dd>v${count(ev.revision)}</dd></dl><div class="service-meta">Исходная запись о сжатии</div><pre class="service-fulltext"><span>${esc(ev.summary ?? "")}</span></pre>` : failed ? `<p>Контекст не изменён.</p><pre class="service-fulltext"><span>${esc(ev.error ?? "")}</span></pre>` : `<p>Сжатие контекста выполняется.</p>`;
    return `<details class="context-notice${failed ? " context-notice-failed" : ""}" data-compaction-state="${completed ? "completed" : failed ? "failed" : "start"}"${ev.revision != null && Number.isFinite(ev.revision) && ev.revision >= 0 ? ` data-compaction-revision="${count(ev.revision)}"` : ""}><summary class="context-summary"><i class="ph ${completed ? "ph-check" : failed ? "ph-warning-circle" : "ph-arrows-in-line-vertical"}" aria-hidden="true"></i><span>${title}</span>${metric ? `<span class="context-value">${metric}</span>` : ""}<i class="ph ph-caret-down service-chevron" aria-hidden="true"></i></summary><div class="context-body">${facts}</div><button type="button" class="service-collapse" data-service-collapse>Свернуть</button></details>`;
}
