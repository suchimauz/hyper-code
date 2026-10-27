/**
 * Render one escaped RAM-only partial response region for web chat
 *
 * Use to mount or refresh transient prose in the standard assistant bubble, with safe Markdown, author metadata and a reduced-motion-aware activity mark. Does not save messages or change durable event cursors.
 * @param opts.agentId Live agent identifier whose scratchpad holds the partial response.
 * @param opts.oob Replace the stream region out of band with the durable event tail. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Live agent identifier whose scratchpad holds the partial response. */
        agentId: string;
        /** Replace the stream region out of band with the durable event tail. @default false */
        oob?: boolean;
    },
): Promise<string> {
    const stream = ctx.state.agent[opts.agentId]?.scratchpad.mobileStream;
    const text = typeof stream?.text === "string" ? stream.text : "";
    // Escape raw HTML first. During streaming, Markdown is presentation only:
    // strip generated attributes and replace images with alt text (no fetches).
    const body = text ? await new HTMLRewriter().on('*', {
        element(element) {
            if (element.tagName === 'img') {
                element.replace(element.getAttribute('alt') ?? '');
                return;
            }
            for (const [name] of element.attributes) element.removeAttribute(name);
        },
    }).transform(new Response(Bun.markdown.html(Bun.escapeHTML(text)))).text() : '';
    // CSS owns motion so the activity mark respects prefers-reduced-motion.
    // Different initial opacities keep activity visible even during rapid swaps.
    const activity = `<span data-stream-activity style="display:inline-flex;vertical-align:middle;margin-inline-start:0.35em;white-space:nowrap" aria-hidden="true"><svg width="32" height="14" viewBox="0 0 32 14" fill="currentColor" style="display:inline-block;color:var(--color-primary,currentColor)">${[0, 1, 2].map(i => `<circle class="chat-stream-dot" cx="${6 + i * 10}" cy="7" r="3" opacity="${[1, 0.55, 0.25][i]}"/>`).join('')}</svg></span>`;
    // Append inside the final prose block; never inject the mark into code/tables.
    const { parseFragment, serialize } = await import('parse5');
    const fragment = parseFragment(body);
    let tail: any = fragment;
    while (tail.childNodes?.length) {
        const children = tail.childNodes.filter((node: any) => node.nodeName !== '#text' || node.value.trim());
        if (!children.length) break;
        tail = children[children.length - 1];
    }
    let target: any = tail;
    while (target && !['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(target.tagName)) target = target.parentNode;
    const mark = parseFragment(activity);
    const destination = target ?? fragment;
    for (const node of mark.childNodes) { (node as any).parentNode = destination; destination.childNodes.push(node); }
    const liveBody = serialize(fragment);
    const author = Bun.escapeHTML(ctx.state.agent[opts.agentId]?.title || 'Hyper');
    const html = text ? `<div class="chat-message chat-message--assistant group relative flex justify-start" data-streaming-message aria-busy="true" aria-label="Ответ формируется"><div class="assistant chat-glass relative w-full text-base-content"><div class="chat-message-meta" data-no-copy><span class="chat-message-author">${author}</span><span>Пишет…</span></div><div class="prose prose-sm max-w-none break-words text-base-content prose-headings:text-base-content prose-p:text-base-content prose-li:text-base-content prose-strong:text-base-content prose-code:text-base-content prose-a:text-muted prose-p:my-1 prose-headings:my-2 prose-pre:my-2">${liveBody}</div></div></div>` : '';
    return ctx.fns.ui.live({ id: 'msg-stream', url: `/agent/${encodeURIComponent(opts.agentId)}/stream.html`, topic: `agent:${opts.agentId}:stream`, every: 30, attrs: opts.oob ? 'hx-swap-oob="outerHTML"' : '', html });
}
