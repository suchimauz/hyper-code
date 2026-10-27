import { parseFragment, serialize } from "parse5";

function esc(s: any): string {
    return String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]!));
}

// Assistant html is model/markdown output and may be malformed. We parse it
// with parse5 — the WHATWG-spec parser, the same algorithm the browser uses —
// and inject the re-serialized tree, so every element opened inside a bubble
// is closed inside that bubble and stray close tags are dropped. One bad
// bubble can no longer swallow the rest of the chat.
//
// Some tokenizer errors mean the tag itself is garbage, e.g. the model wrote
// `<strong Why this is better: …` without '>': the browser (and parse5) turn the
// following prose into attributes and the text silently disappears. For those
// we show the plain text in <pre> instead of the mangled tree.
const FATAL_PARSE_ERRORS = new Set([
    'unexpected-character-in-attribute-name',
    'unexpected-equals-sign-before-attribute-name',
    'unexpected-character-in-unquoted-attribute-value',
    'missing-whitespace-between-attributes',
    'unexpected-solidus-in-tag',
    'eof-in-tag',
    'eof-in-comment',
    'eof-in-script-html-comment-like-text',
]);
function safeAssistantHtml(html: string): string | null {
    let fatal = false;
    const fragment = parseFragment(html, { onParseError: (err) => { if (FATAL_PARSE_ERRORS.has(err.code)) fatal = true; } });
    return fatal ? null : serialize(fragment);
}

function deleteControls(ctx: Context, idx: any, agentId: string, allowOne = true, allowFrom = true, placement: 'overlay' | 'side' = 'overlay'): string {
    if (!agentId) return '';
    const url = '/agent/' + encodeURIComponent(agentId) + '/messages/delete';
    const actionControl = (mode: 'one' | 'from', title: string, confirm: string, icon: string) => ctx.fns.procs.ui.button({
        action: `delete-${mode}`, appearance: 'plain', html: `<i class="ph ${icon} text-sm" aria-hidden="true"></i><span class="sr-only">${title}</span>`,
        post: url, swap: 'none', vals: { idx: String(idx), mode }, title, ariaLabel: title,
        class: 'flex size-7 items-center justify-center rounded-full border border-ui-border bg-base-100/95 text-faint shadow-sm backdrop-blur transition hover:border-error/30 hover:bg-error/10 hover:text-error focus:outline-none focus:ring-2 focus:ring-error/30',
        attrs: { 'hx-confirm': confirm },
    });
    return '<div class="' + (placement === 'side' ? 'flex gap-1' : 'absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100') + '">'
        + (allowOne ? actionControl('one', 'Delete message', 'delete this message?', 'ph-trash') : '')
        + (allowFrom ? actionControl('from', 'Delete from here', 'delete this and everything after?', 'ph-arrow-line-down') : '')
        + '</div>';
}

/**
 * Render one durable chat event with safe message markup, authorized action buttons and lazy tool details.
 * Use for initial history and live event fragments; preserves message anchors and the original HTMX confirmations.
 * @param opts.event Durable event to display, including type, message index, content and optional timestamp.
 * @param opts.agentId Owning agent for action and detail URLs; falls back to the event agent ID.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
        /** Durable event to display, including its type, content and message index. */
event: any;
        /** Owning agent for action and detail URLs; falls back to event.agentId. */
agentId?: string }): Promise<string> {

function messageTime(ts: any): string {
    const value = Number(ts);
    if (!Number.isFinite(value)) return '';
    return new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

// @mentions of known people become chips; a renderer without the mentions module keeps the plain text.
async function mentionChips(ctx: Context, html: string, tone: 'dark' | 'light'): Promise<string> {
    const highlight = (ctx.fns as any).mentions?.highlight;
    return highlight ? await highlight({ html, tone }).catch(() => html) : html;
}

function timeHtml(ts: any, tone: 'dark' | 'light', suffix = ''): string {
    const time = messageTime(ts);
    if (!time) return '';
    // Telegram-style: an inline stamp consumes only the tail of the final line.
    // It stays beside a one-liner and naturally lands at the lower-right when
    // text wraps.
    // data-no-copy: a copied piece of chat is the words, not their timestamps.
    return '<span data-no-copy class="inline-block ml-2 whitespace-nowrap text-3xs leading-none '
        + (tone === 'dark' ? 'text-white/70' : 'text-muted')
        + '">' + esc(time) + suffix + '</span>';
}

function appendTime(html: string, ts: any, tone: 'dark' | 'light', suffix = ''): string {
    const stamp = timeHtml(ts, tone, suffix);
    if (!stamp) return html;
    // Markdown's common one-line shape is <p>…</p>. Keeping the float inside
    // that final paragraph lets it share the line instead of creating a row.
    if (/<\/p>\s*$/.test(html)) return html.replace(/<\/p>\s*$/, stamp + '</p>');
    return html + stamp;
}
    const ev = opts.event;
    const agentId = String(opts.agentId ?? ev?.agentId ?? '');
    if (!ev || typeof ev !== "object") return "";
    const eventCard = (input: any) => {
        const technical = [ev.type, ev.event, ev.status, ev.watchStatus].filter(Boolean).map(esc).join(' · ');
        const card = { ...input, ts: ev.ts, details: `<div class="service-meta"><code>${technical}</code>${ev.taskId ? `<span>ID шага: ${esc(ev.taskId)}</span>` : ''}</div>${input.details ?? ''}`, attrs: `data-service-event="${esc(ev.type)}"${input.attrs ? ' ' + input.attrs : ''}` };
        return (ctx as any).fns.ui.chatEventCard
            ? (ctx as any).fns.ui.chatEventCard(card)
            : `<details class="service-event service-event--${esc(card.tone ?? 'neutral')}" ${card.attrs}><summary>${card.icon ? `<i class="ph ph-${esc(card.icon)}" aria-hidden="true"></i>` : ''}<span>${esc(card.title)}</span>${card.subtitle ? `<span>${esc(card.subtitle)}</span>` : ''}${card.preview ? `<span>${esc(String(card.preview).slice(0, 1000))}</span>` : ''}</summary><div>${card.body ?? ''}${card.details ?? ''}${card.href ? `<a href="${esc(card.href)}">Открыть чат</a>` : ''}</div><button type="button" data-service-collapse>Свернуть</button></details>`;
    };
    const badge = (label: string, tone: 'neutral' | 'info' | 'success' | 'warning' | 'error' = 'neutral') => (ctx as any).fns.ui.statusBadge
        ? (ctx as any).fns.ui.statusBadge({ label, tone })
        : `<span class="badge badge-sm">${esc(label)}</span>`;

    if (ev.excludedFromLlm) {
        // Collapsed out of the LLM's view after a successful correction — the
        // audit stays visible, dimmed, with an out-of-context chip. Recurse
        // through the registry for the normal rendering of the same event.
        const inner: string = await (ctx as any).fns.agent.renderEventHtml({ event: { ...ev, excludedFromLlm: false }, agentId });
        return '<div class="relative opacity-50"><span class="absolute -top-2 right-2 z-10 text-3xs px-1.5 py-0.5 rounded-full border border-ui-border bg-base-200 text-subtle">outside context</span>' + inner + '</div>';
    }

    if (ev.type === 'agent_message_outgoing' && ev.outgoingAgentMessage) {
        return '<div id="event-' + esc(ev.idx) + '" class="chat-message chat-message--peer">'
            + await ctx.fns.agent.renderPeerMessageHtml({ event: ev, agentId }) + '</div>';
    }

    if ((ev.type === 'wake_up' && !ev.watchId && ev.triggerKind !== 'watch') || (['user', 'user_message'].includes(ev.type) && ev.automationKind === 'scheduled')) {
        const card = await ctx.fns.agent.renderAutomationEventHtml({ event: ev });
        const anchor = ev.messageIdx != null ? 'm-' + esc(ev.messageIdx) : 'event-' + esc(ev.idx);
        return '<div id="' + anchor + '" class="chat-message chat-message--automation">' + card + '</div>';
    }

    if (ev.type === "user") {
        const idx = ev.messageIdx ?? ev.idx ?? 0;
        // Peer text stays verbatim; the compact native disclosure is shared with outgoing receipts.
        if (ev.agentMessage || String(ev.actor ?? '').startsWith('agent:')) {
            const card = await ctx.fns.agent.renderPeerMessageHtml({ event: ev, agentId });
            return '<div id="m-' + idx + '" class="chat-message chat-message--peer group relative">' + card
                + '<div class="service-actions">' + deleteControls(ctx, idx, agentId, true, true, 'side') + '</div></div>';
        }
        const ragFunctions = Array.isArray(ev.functionRag?.functions) ? ev.functionRag.functions : [];
        const ragNames = ragFunctions.map((item: any) => String(typeof item === "string" ? item : item?.name ?? "")).filter(Boolean);
        const injected = String(ev.functionRag?.injected ?? ragNames.join("\n"));
        // Separate heuristic gate and retrieval outcomes, including empty results.
        const ragGate = String(ev.functionRag?.gate ?? "off");
        const ragReranked = ev.functionRag?.reranked === true;
        const needsTool = ev.functionRag?.needsTool;
        const retrieved = Number(ev.functionRag?.retrieved ?? 0);
        const badge = (html: string, label: string, tip: string) =>
            '<span class="group/rag relative ml-2 inline-flex items-center gap-1 align-middle" aria-label="' + esc(label) + '" tabindex="0">' + html
            + '<span role="tooltip" class="pointer-events-none invisible absolute bottom-full right-0 z-30 mb-2 w-max max-w-[32rem] whitespace-pre-wrap rounded-lg border border-ui-border bg-base-100 px-3 py-2 font-mono text-3xs leading-4 text-muted opacity-0 shadow-xl transition group-hover/rag:visible group-hover/rag:opacity-100 group-focus/rag:visible group-focus/rag:opacity-100">' + esc(tip) + '</span></span>';
        const gateBadge = !ev.functionRag ? '' : badge(
            ragGate === "closed"
                ? '<span class="h-1.5 w-1.5 rounded-full border border-white/50" aria-hidden="true"></span>'
                : ragGate === 'error' ? '<span class="text-error text-3xs" aria-hidden="true">!</span>'
                : ragGate === 'off' ? '<span class="text-white/40 text-3xs" aria-hidden="true">−</span>'
                : '<span class="h-1.5 w-1.5 rounded-full" style="background:rgb(251 191 36)" aria-hidden="true"></span>',
            `Gate: ${ragGate}`,
            `gate ${ragGate}` + (needsTool == null ? '' : ` · heuristic score ${Number(needsTool).toFixed(2)}`)
                + (ragGate === 'error' ? '\nclassification failed; retrieval allowed' : '')
                + (ragGate === 'closed' ? '\nno retrieval, nothing injected' : `\nretrieved ${retrieved}`),
        );
        const dotColor = ragReranked ? 'background:rgb(52 211 153)' : 'background:rgb(165 180 252)';
        const dots = ragNames.map(() => '<span class="h-1.5 w-1.5 rounded-full" style="' + dotColor + '" aria-hidden="true"></span>').join('');
        const scores = ragFunctions.filter((fn: any) => typeof fn !== 'string').map((fn: any) => `${fn.name}: RRF ${fn.score ?? 'n/a'} · BM25 ${fn.bm25 ?? 'n/a'} · cosine ${fn.similarity ?? 'n/a'} · rerank ${fn.jev ?? 'n/a'}`).join('\n');
        const ragIcon = gateBadge + (ev.functionRag && ragNames.length
            ? badge(dots, `Function RAG: retrieved ${retrieved}, kept ${ragNames.length}`,
                `retrieved ${retrieved} · kept ${ragNames.length} · rerank ${ev.functionRag.rerankStatus ?? (ragReranked ? 'ok' : 'off')}\n${scores}\n${injected}`)
            : '');
        const attachmentHtml = Array.isArray(ev.attachments) && ev.attachments.length
            ? '<div class="mb-2 flex flex-wrap justify-end gap-2">' + ev.attachments.map((item: any) => {
                const url = '/attachments/' + encodeURIComponent(agentId) + '/' + encodeURIComponent(String(item.id));
                if (String(item.mimeType).startsWith('image/')) return '<a href="' + url + '" target="_blank" rel="noopener" class="block"><img src="' + url + '" alt="' + esc(item.fileName) + '" class="h-20 max-w-40 rounded-lg border border-white/25 object-cover"></a>';
                return '<a href="' + url + '" target="_blank" rel="noopener" class="inline-flex max-w-56 items-center gap-2 rounded-lg border border-white/25 bg-black/10 px-3 py-2 text-left text-xs"><i class="ph ph-file"></i><span class="truncate">' + esc(item.fileName) + '</span></a>';
            }).join('') + '</div>'
            : '';
        // Messenger-style author: name inside the bubble, round photo (or colored initials) beside it.
        const author = (ctx as any).fns.auth?.author ? await (ctx as any).fns.auth.author({ userId: ev.actor ?? null }).catch(() => null) : null;
        const authorName = author
            ? '<div class="mb-0.5 text-xs font-semibold leading-tight whitespace-normal" data-author="' + esc(author.id) + '" style="color:hsl(' + author.hue + ' 75% 72%)">' + esc(author.name) + '</div>'
            : '';
        const avatar = author
            ? (author.picture
                ? '<img src="' + esc(author.picture) + '" alt="' + esc(author.name) + '" title="' + esc(author.name) + '" class="size-8 shrink-0 rounded-full object-cover" referrerpolicy="no-referrer" loading="lazy">'
                : '<span class="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style="background:hsl(' + author.hue + ' 55% 45%)" title="' + esc(author.name) + '" aria-hidden="true">' + esc(author.initials) + '</span>')
            : '';
        return '<div id="m-' + idx + '" class="chat-message chat-message--user group relative flex items-end justify-end gap-2 pb-0">'
            + '<div class="relative ml-auto max-w-[80%]">'
            + '<div class="chat-glass-primary ' + (author ? 'rounded-2xl rounded-br-md px-3.5 py-2' : 'rounded-xl px-4 py-3') + ' text-white whitespace-pre-wrap break-words shadow-sm border border-black/20">'
            + authorName
            + attachmentHtml
            + appendTime((ev.text ? await mentionChips(ctx, esc(ev.text), 'light') : '') + ragIcon, ev.ts, 'dark')
            + '</div>'
            + '<div class="absolute right-full top-1/2 z-10 mr-2 flex -translate-y-1/2 gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">' + deleteControls(ctx, idx, agentId, true, true, 'side') + '</div>'
            + '</div>' + avatar + '</div>';
    }

    if (ev.type === "assistant") {
        const idx = ev.messageIdx ?? ev.idx ?? 0;
        const usage = '';
        // Defensive: if the pre-rendered html is unbalanced (markdown.render
        const indicators = ev.instructionIndicators ?? {};
        const statusDot = indicators.statusLine
            ? '<span title="Status line: ' + esc(indicators.statusLine) + '" aria-label="status line applied" class="ml-1.5 inline-block size-1.5 rounded-full bg-base-300 align-middle"></span>'
            : '';
        const instructionMarks = statusDot;
        // sometimes chokes on heredoc / shell `>` / mixed-code prose) fall
        // back to a plain escaped <pre>. One bad bubble must not break the
        // whole page layout below it.
        const rawHtml = ev.html || ('<p>' + esc(ev.text || '') + '</p>');
        const safeHtml = await mentionChips(ctx, safeAssistantHtml(rawHtml)
            ?? '<pre class="text-xs whitespace-pre-wrap break-words">' + esc(ev.text || '') + '</pre>', 'light');
        const assistantName = (ctx.state as any)?.agent?.[agentId]?.title || 'Hyper';
        return '<div id="m-' + idx + '" class="chat-message chat-message--assistant group relative flex justify-start">'
            + '<div class="assistant chat-glass w-full text-base-content">'
            + '<div class="chat-message-meta" data-no-copy><span class="chat-message-author">' + esc(assistantName) + '</span>' + timeHtml(ev.ts, 'light', instructionMarks) + '</div>'
            + '<div class="prose prose-sm max-w-none text-base-content prose-headings:text-base-content prose-p:text-base-content prose-li:text-base-content prose-strong:text-base-content prose-code:text-base-content prose-a:text-muted prose-p:my-1 prose-headings:my-2 prose-pre:my-2">'
            + safeHtml
            + '</div>'
            + usage
            + '</div>'
            + '<div class="absolute left-full top-1/2 z-10 ml-2 flex -translate-y-1/2 gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">' + deleteControls(ctx, idx, agentId, true, true, 'side') + '</div>'
            + '</div>';
    }

    if (ev.type === "thinking") {
        return eventCard({ title: 'Размышление', subtitle: 'Подробности по раскрытию', icon: 'brain', tone: 'neutral', details: `<pre class="whitespace-pre-wrap font-mono text-2xs leading-snug text-muted">${esc(ev.text || '')}</pre>` });
    }

    if (ev.type === "tool_call") {
        const meta = (ctx as any).fns.agent.toolMeta({ name: ev.name, args: ev.args });
        // File-changing tools get a stronger outline; errors take precedence.
        const destructive = new Set(['write', 'edit', 'remove', 'rename']).has(String(ev.name ?? ''));
        const cardStyle = ev.isError
            ? 'border-error/55 bg-error/10 text-error'
            : destructive ? 'border-ui-border-strong bg-transparent text-muted' : 'border-ui-border-strong bg-transparent text-subtle';
        const bodyMethod = agentId && ev.idx != null ? 'agent.toolDetails' : '';
        const title = String(meta.label + ' ' + meta.subject).trim();

        return (ctx as any).fns.ui.popup({
            method: bodyMethod,
            params: { agentId, idx: Number(ev.idx) },
            html: '<i class="ph ' + esc(meta.icon) + '" aria-hidden="true"></i><span class="chat-tool-label">' + esc(meta.label) + '</span><span class="chat-tool-subject">' + esc(meta.subject) + '</span>' + (ev.isError ? '<span class="chat-tool-state">Ошибка</span>' : ''),
            attrs: 'class="tool tool-tucked shrink-0 rounded-full border ' + cardStyle + '" data-tool="' + esc(ev.name || 'tool') + '" data-title="' + esc(title) + '"' + (ev.isError ? ' data-error="1"' : '') + ' title="' + esc(title) + '" aria-label="' + esc(title) + '"',
        });
    }

    // "Message received; here is what is blocking it." This card is a permanent
    // transcript entry; the ticking card above the composer is live. Both can
    // appear at once: one records history, the other shows the current state.
    if (ev.type === "tool_busy") {
        const secs = Number(ev.elapsedSec ?? 0);
        const mins = Math.floor(secs / 60);
        const been = mins >= 1 ? `${mins} мин` : `${secs} с`;
        const limit = Number(ev.timeoutMs) > 0 ? ` · лимит ${Math.round(Number(ev.timeoutMs) / 60000)} мин` : '';
        const stop = ev.runId && agentId
            ? ctx.fns.procs.ui.button({
                action: 'abort-tool-call',
                label: `Остановить ${String(ev.name ?? 'инструмент')}`,
                size: 'xs',
                class: 'mt-2 rounded-full',
                title: 'Остановить только этот вызов — агент продолжит работу и прочитает сообщение',
                post: `/agent/${encodeURIComponent(agentId)}/tool/${encodeURIComponent(String(ev.runId))}/abort`,
                swap: 'none',
            })
            : '';
        return eventCard({
            title: 'Сообщение ожидает обработки', subtitle: `${String(ev.name ?? 'инструмент')} · ${been}${limit}`,
            icon: 'timer',
            tone: 'warning',
            body: `<div class="font-mono text-3xs text-muted">${esc(String(ev.subject ?? ''))}</div>`
                + `<div class="mt-1">Сообщение получено; агент прочитает его после завершения вызова.</div>${stop}`,
        });
    }

    if (ev.type === "tool_aborted") {
        return eventCard({
            title: 'Вызов остановлен', subtitle: `${String(ev.name ?? 'инструмент')} · по запросу пользователя`,
            icon: 'hand-palm',
            tone: 'neutral',
            badge: badge(`${Number(ev.elapsedSec ?? 0)} с`, 'neutral'),
            body: `<div class="font-mono text-3xs text-muted">${esc(String(ev.subject ?? ''))}</div>`,
        });
    }

    if (ev.type === "input") {
        // A chat input (input.request): the card renders the row's CURRENT state,
        // so the same event shows the live form first and the answer later.
        return (ctx as any).fns.input?.card ? await (ctx as any).fns.input.card({ id: String(ev.inputId ?? '') }) : '';
    }

    if (ev.type === "canvas_ping") {
        // A canvas tab's page called hyper.ping: it woke the agent with this.
        const data = ev.data === undefined ? "" : JSON.stringify(ev.data, null, 2);
        return eventCard({ title: 'Сигнал с canvas', subtitle: String(ev.title ?? 'Вкладка'), icon: 'square-half', tone: 'neutral', body: esc(String(ev.text ?? "")), details: data ? `<pre class="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-ui-border bg-base-100 p-2 font-mono text-3xs leading-4 text-muted">${esc(data)}</pre>` : undefined });
    }

    if (ev.type === "plan_activation") {
        return eventCard({ title: 'Начат шаг', subtitle: String(ev.title ?? ev.taskId ?? 'Задача'), icon: 'list-checks', tone: 'info', body: `<div class="font-medium text-muted">${esc(ev.title ?? ev.taskId ?? "Task")}</div>${ev.instructions ? `<div class="mt-1 whitespace-pre-wrap">${esc(ev.instructions)}</div>` : ""}` });
    }


    if (ev.type === "attachment_event") {
        const source = String(ev.source ?? "external");
        const payload = ev.payload && typeof ev.payload === "object" ? ev.payload : {};
        const isTelegram = source === "telegram";
        const chat = String(payload.chatTitle ?? payload.chatId ?? source);
        const sender = String(payload.senderName ?? payload.senderId ?? "");
        const text = String(payload.text ?? payload.summary ?? "");
        const subtitle = isTelegram ? `Telegram · ${chat}` : `${source} · ${String(ev.eventType ?? 'новое событие')}`;
        const body = `${sender ? `<div class="mb-1 text-3xs font-medium text-muted">${esc(sender)}</div>` : ""}<div class="whitespace-pre-wrap break-words">${esc(text)}</div>`;
        const details = `<pre class="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-ui-border bg-base-100 p-2 font-mono text-3xs leading-4 text-muted">${esc(JSON.stringify(payload, null, 2))}</pre>`;
        return eventCard({ title: 'Внешнее сообщение', subtitle, icon: 'arrow-square-out', tone: 'info', body, details });
    }


    if (ev.type === "wake_up") {
        const ready = ev.watchStatus === 'ready';
        const timeout = ev.watchStatus === 'timeout';
        const title = ready ? 'Условие выполнено' : timeout ? 'Условие не выполнено в срок' : 'Сработало условие';
        const result = ev.result == null ? '' : JSON.stringify(ev.result, null, 2);
        const storedResult = ev.resultRef?.id ? `<div class="service-meta">Сохранённый результат: <code>${esc(ev.resultRef.id)}</code></div>` : '';
        const resultPreview = ev.resultPreview != null ? `<pre class="service-fulltext"><span>${esc(ev.resultPreview)}</span></pre>` : '';
        return eventCard({ title, subtitle: String(ev.watchId ?? ev.triggerId ?? ''), icon: timeout ? 'timer' : 'eye', tone: ready ? 'success' : timeout ? 'warning' : 'neutral', body: `<div class="whitespace-pre-wrap">${esc(ev.prompt ?? ev.reason ?? '')}</div>${ev.summary ? `<div class="whitespace-pre-wrap">${esc(ev.summary)}</div>` : ''}`, details: storedResult + resultPreview + (result ? `<pre class="service-fulltext"><span>${esc(result)}</span></pre>` : '') });
    }


    if (ev.type === "parked") {
        // The quota is spent, not the agent broken. Say when it resumes and by
        // whose doing — otherwise a silent agent reads as a hang.
        const account = ev.account && ev.account !== "default" ? `/${ev.account}` : "";
        const resetsAt = Number(ev.resetsAt ?? ev.wakeAt ?? 0);
        const when = resetsAt ? new Date(resetsAt).toLocaleString('ru-RU') : 'время неизвестно';
        return eventCard({
            title: 'Пауза: лимит подписки', subtitle: `Возобновление · ${when}`,
            icon: "pause-circle",
            tone: "warning",
            badge: badge(`${ev.provider ?? "provider"}${account}`, "warning"),
            body: `${esc(ev.message ?? 'Квота исчерпана.')}<div class="mt-1 text-subtle">${resetsAt ? `Автоматическое возобновление: ${esc(when)}.` : 'Время возобновления пока неизвестно.'} Чтобы продолжить раньше, смените модель или учётную запись.</div>`,
        });
    }

    if (ev.type === "unparked") {
        const why = ev.reason === 'wake' ? 'Квота восстановлена' : ev.reason === 'model-switch' ? 'Модель изменена' : 'Пауза снята вручную';
        return eventCard({
            title: ev.resumed ? 'Работа возобновлена' : 'Пауза снята',
            icon: "play-circle",
            tone: "info", subtitle: why,
            body: `${esc(why)}${ev.resumed ? " — продолжается незавершённая работа" : ""}`,
        });
    }

    if (ev.type === "model_changed") {
        return eventCard({
            title: 'Модель изменена', subtitle: `${String(ev.from ?? '?')} → ${String(ev.to ?? '?')}`,
            icon: 'swap',
            tone: 'neutral',
            body: `<span class="font-mono text-2xs">${esc(ev.from ?? "?")}</span> → <span class="font-mono text-2xs">${esc(ev.to ?? "?")}</span>`,
        });
    }

    if (ev.type === "goal_activation") {
        return eventCard({ title: 'Цель включена', subtitle: `До ${Number(ev.iterations ?? 3)} итераций`, icon: 'target', tone: 'info', body: esc(ev.text ?? '') });
    }


    if (ev.type === "goal_check") {
        const status = String(ev.status ?? "unclear");
        const achieved = status === "achieved";
        const limited = status === "limit_reached";
        const tone = achieved ? 'success' : status === 'continue' ? 'info' : 'warning';
        const icon = achieved || status === 'continue' ? 'target' : limited ? 'pause-circle' : 'warning';
        const title = achieved ? 'Цель достигнута' : limited ? 'Лимит итераций достигнут' : status === 'continue' ? 'Цель ещё не достигнута' : 'Результат требует проверки';
        const count = ev.maxIterations ? ` · ${Number(ev.iteration ?? 0)}/${Number(ev.maxIterations)}` : "";
        return eventCard({ title, subtitle: count ? `Итерация ${Number(ev.iteration ?? 0)} из ${Number(ev.maxIterations)}` : undefined, icon, tone, body: `${esc(ev.reason ?? '')}${ev.nextStep ? `<div class="mt-1"><span class="font-medium text-muted">Следующий шаг:</span> ${esc(ev.nextStep)}</div>` : ''}` });
    }


    if (ev.type === "attempt") {
        // A protocol-invalid candidate that was repaired before commit — never
        // part of the LLM transcript; kept for the audit trail.
        return '<div class="relative opacity-60">' + eventCard({ title: 'Попытка исправлена', subtitle: 'Только аудит', icon: 'wrench', tone: 'neutral', body: esc(String(ev.error ?? '')), details: `<pre class="whitespace-pre-wrap break-words font-mono text-3xs text-muted">${esc(ev.text)}</pre>` }) + '</div>';
    }

    if (ev.type === "team_update") {
        const variants: Record<string, { title: string; icon: string; tone: string }> = {
            'task.completed': { title: 'Шаг выполнен', icon: 'check-circle', tone: 'neutral' },
            'plan.completed': { title: 'План завершён', icon: 'checks', tone: 'success' },
            answer: { title: 'Ответ агента', icon: 'chat-text', tone: 'neutral' },
            blocked: { title: 'Нужна помощь', icon: 'hand-palm', tone: 'warning' },
            failed: { title: 'Ошибка выполнения', icon: 'x-circle', tone: 'error' },
        };
        const variant = variants[String(ev.event)] ?? { title: 'Событие команды', icon: 'users-three', tone: 'neutral' };
        const member = ev.memberId && ctx.fns.auth?.author ? await ctx.fns.auth.author({userId:'agent:' + String(ev.memberId)}) : null;
        return eventCard({ ...variant, subtitle: [member?.name, ev.memberId, ev.taskTitle].filter(Boolean).join(' · '), preview: ev.event === 'plan.completed' ? String(ev.summary ?? '') : undefined, href: ev.memberId ? '/agent/' + encodeURIComponent(String(ev.memberId)) : undefined, body: `<div class="whitespace-pre-wrap">${esc(ev.summary ?? '')}</div>`, attrs: 'data-team-update="' + esc(ev.event) + '"' });
    }


    if (['compaction_start', 'compaction_completed', 'compaction_failed'].includes(ev.type)) {
        return await ctx.fns.agent.renderCompactionEventHtml({ event: ev });
    }


    if (ev.type === "error") {
        // Errors surface as a toast (session.appendErrorEvent notifies) and in
        // the status bar; the row stays in the events table for the audit.
        // Keeping a red slab in the transcript on top of that was three copies
        // of the same bad news, and the only one that could not be dismissed.
        return '';
    }

    if (ev.type === "job") {
        return '';
    }

    return '';
}
