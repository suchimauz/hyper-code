// Emit a toast for compatible document consumers; delivery is not confirmed.
//
// `message` is the one line a reader scans; `body` is the detail they need when
// that line is not enough — a provider's 400 explanation, a stack, the tail of
// a failed command. `bodyHtml` is the same detail already syntax-highlighted,
// which is what a tool call sends: a shell command reads as a command and a
// file reads as its language, in the corner as much as in the transcript.
/**
 * Emit a toast notification for compatible document consumers.
 * /ui/control.js handles this event in SSR documents, not the primary React shell.
 * Returning the event does not confirm that a toast was displayed.
 * @param opts.message Notification title or message.
 * @param opts.body Plain-text notification details.
 * @param opts.bodyHtml HTML notification body.
 * @param opts.level Notification severity.
 * @param opts.html Initial or inner HTML content.
 * @param opts.agentId Target agent identifier.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Notification message. */ message: string;
        /** Plain-text notification details. */ body?: string;
        /** HTML notification details for a compatible toast consumer. */ bodyHtml?: string;
        /** Notification severity. @default info */ level?: 'info' | 'warn' | 'error';
        /** Rendered HTML content. */ html?: string;
        /** Agent associated with the toast; omitted for a global notification. */ agentId?: string },
) {
    const event = {
        type: 'ui.notify',
        level: opts.level ?? 'info',
        message: opts.message,
        body: opts.body ?? null,
        bodyHtml: opts.bodyHtml ?? null,
        html: opts.html ?? null,
        // Which agent's work this is about. A tab showing agent A has no
        // business toasting agent B's tool calls — the rail's unread badge is
        // where B's activity shows. Toasts without an agentId stay global.
        agentId: opts.agentId ?? null,
    };
    ctx.fns.procs.events.emit({ event });
    return event;
}
