/**
 * Render a compact, expandable lifecycle event with a semantic icon and optional original details.
 *
 * Use for durable plan, goal, watch, execution and external events in chat history. The native disclosure keeps long bodies collapsed, preserves trusted server markup and places navigation/actions outside the summary. Does not alter the LLM transcript.
 * @param opts.title Visible event heading.
 * @param opts.subtitle Plain-text context visible while collapsed.
 * @param opts.preview Plain-text outcome preview, bounded to 1000 characters and three visual lines.
 * @param opts.ts Persisted event timestamp in milliseconds; omitted or invalid timestamps are hidden.
 * @param opts.body Trusted server-rendered original body HTML, shown after expansion.
 * @param opts.icon Phosphor icon name without the ph prefix.
 * @param opts.tone Semantic visual tone. @default neutral
 * @param opts.badge Trusted compact badge HTML shown in the heading.
 * @param opts.href Optional internal destination shown as a separate link in the expanded body.
 * @param opts.details Trusted server-rendered technical details HTML.
 * @param opts.attrs Additional trusted attributes on the outer disclosure.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Visible event heading. */ title: string;
        /** Plain-text context visible while collapsed. */ subtitle?: string;
        /** Plain-text outcome preview, bounded to 1000 characters and three visual lines. */ preview?: string;
        /** Persisted event timestamp in milliseconds; omitted or invalid timestamps are hidden. */ ts?: number;
        /** Trusted server-rendered original body HTML, shown after expansion. */ body?: string;
        /** Phosphor icon name without the ph prefix. */ icon?: string;
        /** Semantic visual tone. @default neutral */ tone?: "neutral" | "info" | "success" | "warning" | "error";
        /** Trusted compact badge HTML shown in the heading. */ badge?: string;
        /** Optional internal destination shown as a separate link in the expanded body. */ href?: string;
        /** Trusted server-rendered technical details HTML. */ details?: string;
        /** Additional trusted attributes on the outer disclosure. */ attrs?: string;
    },
): string {
    const esc = (value: string) => Bun.escapeHTML(value);
    const tone = opts.tone ?? 'neutral';
    const date = new Date(opts.ts ?? NaN);
    const stamp = Number.isFinite(date.getTime()) ? `<time datetime="${date.toISOString()}" title="${esc(date.toLocaleString('ru-RU'))}">${date.toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'})}</time>` : '';
    const icon = opts.icon ? `<span class="service-mark"><i class="ph ph-${esc(opts.icon)}" aria-hidden="true"></i></span>` : '';
    const badge = opts.badge ? `<span class="service-event-badge">${opts.badge}</span>` : '';
    const destination = opts.href && /^\/[^/]/.test(opts.href) ? `<a class="service-event-link" href="${esc(opts.href)}">Открыть агента <i class="ph ph-arrow-square-out" aria-hidden="true"></i></a>` : '';
    const original = `${opts.body ? `<div class="service-event-original">${opts.body}</div>` : ''}${opts.details ? `<div class="service-event-details">${opts.details}</div>` : ''}${destination}`;
    return `<details class="service-message service-event service-event--${tone}"${opts.attrs ? ' ' + opts.attrs : ''}><summary class="service-toggle"><span class="service-heading">${icon}<span class="service-identity"><span class="service-title">${esc(opts.title)}</span>${opts.subtitle ? `<span class="service-subtitle">${esc(opts.subtitle)}</span>` : ''}</span>${badge}${stamp}<i class="ph ph-caret-down service-chevron" aria-hidden="true"></i></span>${opts.preview ? `<span class="service-preview">${esc(opts.preview.slice(0, 1000))}</span>` : ''}</summary><div class="service-body">${original}</div><button type="button" class="service-collapse" data-service-collapse data-no-copy><i class="ph ph-caret-up" aria-hidden="true"></i>Свернуть</button></details>`;
}
