/**
 * Render one escaped RAM-only partial response region for web chat
 *
 * Use to mount or refresh transient web chat prose without saving it or changing durable event cursors.
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
    return ctx.fns.ui.live({ id: "msg-stream", url: `/agent/${encodeURIComponent(opts.agentId)}/stream.html`, topic: `agent:${opts.agentId}:stream`, every: 30, attrs: opts.oob ? 'hx-swap-oob="outerHTML"' : "", html: text ? `<div class="assistant rounded-xl px-3 py-2" aria-busy="true"><div class="text-xs text-faint" role="status">Streaming response…</div><div class="whitespace-pre-wrap break-words">${Bun.escapeHTML(text)}</div></div>` : "" });
}
