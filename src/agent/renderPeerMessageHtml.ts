/**
 * Render a collapsible incoming or confirmed outgoing agent message with its original text
 *
 * Use inside the chat event renderer for peer messages. Shows the first three lines, direction, route and sender color; native details keeps the complete escaped body accessible without JavaScript. Outgoing delivery events are UI-only and must be backed by a durable receipt.
 * @param opts.agentId Conversation owner, used as recipient for incoming messages and sender for outgoing messages.
 * @param opts.event Persisted peer event with original message body and explicit outgoing receipt metadata when applicable.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Conversation owner, used as recipient for incoming messages and sender for outgoing messages. */
        agentId: string;
        /** Persisted peer event with original message body and explicit outgoing receipt metadata when applicable. */
        event: { idx?: number; ts?: number; actor?: string; text?: string; agentMessage?: { from?: string; title?: string; body?: string; hop?: number; onBehalfOf?: string }; outgoingAgentMessage?: { deliveryKey: string; to: string; title?: string; body: string; hop?: number; status: "queued" | "delivered"; messageIdx?: number | null } };
    },
): Promise<string> {
    const { event, agentId } = opts;
    const esc = (value: string | number) => Bun.escapeHTML(String(value));
    const outgoing = event.outgoingAgentMessage;
    const incoming = event.agentMessage;
    const from = outgoing ? agentId : String(incoming?.from ?? event.actor?.replace(/^agent:/, '') ?? '');
    const to = outgoing ? outgoing.to : agentId;
    const peer = outgoing ? to : from;
    const sender = await ctx.fns.auth.author({ userId: 'agent:' + from });
    const recipient = outgoing ? await ctx.fns.auth.author({ userId: 'agent:' + to }) : null;
    const title = outgoing ? (recipient?.name ?? outgoing.title ?? 'Агент ' + to) : (sender?.name ?? incoming?.title ?? 'Агент ' + from);
    const rawHue = Number(sender?.hue ?? 210);
    const hue = Number.isFinite(rawHue) ? ((rawHue % 360) + 360) % 360 : 210;
    const body = String(outgoing?.body ?? incoming?.body ?? event.text ?? '');
    const hop = outgoing?.hop ?? incoming?.hop;
    const owner = incoming?.onBehalfOf ? await ctx.fns.auth.getUser({ id: incoming.onBehalfOf }) : null;
    const direction = outgoing ? 'Исходящее' : 'Входящее';
    const state = outgoing ? (outgoing.status === 'delivered' ? 'Отправлено' : 'В очереди') : 'Получено';
    const date = new Date(Number(event.ts));
    const time = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('ru-RU', {hour:'2-digit',minute:'2-digit'}).format(date) : '';
    const id = 'peer-body-' + encodeURIComponent(agentId) + '-' + (event.idx ?? 0);
    const arrow = outgoing ? '<path d="M5 19 19 5M9 5h10v10"/>' : '<path d="M19 5 5 19M5 9v10h10"/>';
    const svg = (path: string, cls: string) => '<svg class="' + cls + '" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
    const chars = new Intl.NumberFormat('ru-RU').format(body.length);
    return '<details class="service-message service-message--peer service-message--' + (outgoing ? 'outgoing' : 'incoming') + '" style="--service-hue:' + hue + '" data-agent-message="' + esc(peer) + '" data-message-direction="' + (outgoing ? 'outgoing' : 'incoming') + '">'
     + '<summary class="service-toggle" aria-controls="' + esc(id) + '">'
     + '<span class="service-heading" data-no-copy><span class="service-mark">' + svg(arrow, 'service-direction-icon') + '</span><span class="service-identity"><span class="service-direction">' + direction + '</span><span class="service-title">' + (outgoing ? 'Кому: ' : 'От: ') + esc(title) + '</span><span class="service-meta"><span>' + state + '</span><span class="service-route">' + esc(from) + ' → ' + esc(to) + '</span>' + (time ? '<time datetime="' + date.toISOString() + '">' + time + '</time>' : '') + '</span></span>' + svg('<path d="m6 9 6 6 6-6"/>', 'service-chevron') + '</span>'
     + '<span class="service-preview">' + esc(body.slice(0, 1000)) + '</span><span class="service-hint" data-no-copy>' + chars + ' зн. · Нажмите, чтобы раскрыть</span></summary>'
     + '<div class="service-body" id="' + esc(id) + '"><div class="service-body-meta" data-no-copy><a href="/agent/' + encodeURIComponent(peer) + '" data-author="agent:' + esc(peer) + '">' + esc(title) + '</a>' + (hop ? ' · hop ' + esc(hop) : '') + (owner?.name ? ' · от имени ' + esc(owner.name) : '') + ' · ' + chars + ' зн. · оригинал</div><pre class="service-fulltext"><span>' + esc(body) + '</span></pre></div>'
     + '<button type="button" class="service-collapse" data-service-collapse data-no-copy>' + svg('<path d="m6 15 6-6 6 6"/>', '') + 'Свернуть сообщение</button></details>';
}
