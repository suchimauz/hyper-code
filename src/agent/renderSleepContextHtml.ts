/**
 * Show the model's compacted context separately from the complete durable chat history.
 * Use on initial chat pages with an active compact generation. Never filters UI-only
 * events or old correspondence by the model's message frontier.
 * @param opts.sleepContext Persisted model compaction state.
 * @param opts.events Durable UI events to render when historyHtml is omitted.
 * @param opts.agentId Owning conversation for history links and controls.
 * @param opts.historyHtml Trusted paginated history from renderHistoryPage; avoids rendering twice.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Persisted model compaction state. */
        sleepContext: Record<string, any>;
        /** Durable UI events to render when historyHtml is omitted. */
        events: any[];
        /** Owning conversation for history links and controls. */
        agentId: string;
        /** Trusted paginated history from renderHistoryPage; avoids rendering twice. */
        historyHtml?: string;
    },
): Promise<string> {
    const sleep = ctx.fns.agent.normalizeSleepContext({ sleepContext: opts.sleepContext });
    if (sleep?.mode !== "compact") return "";
    const generation = ctx.fns.agent.getSleepGeneration({ sleepContext: sleep, kind: "active" });
    if (!generation) return "";
    const historyHtml = opts.historyHtml ?? await ctx.fns.agent.renderEventsHtml({ events: opts.events, agentId: opts.agentId });
    const contextMessages = generation.contextAgentId
        ? await ctx.fns.session.getMessages({ id: String(generation.contextAgentId) })
        : generation.contextMessages;
    // Consolidation is a read-only model artifact, not a second conversation.
    // Keep it collapsed and do not manufacture m-0 anchors or delete controls.
    const esc = (text: string) => Bun.escapeHTML(text);
    const contextHtml = Array.isArray(contextMessages) ? contextMessages.map((message: any) => {
        const text = typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? '');
        return `<pre class="whitespace-pre-wrap break-words text-xs"><span>${esc(text)}</span></pre>`;
    }).join('\n') : '';
    return `<details class="rounded-lg border border-ui-border bg-base-200 px-3 py-2 text-xs text-muted" data-compact-context><summary class="cursor-pointer font-medium">Контекст модели сжат · переписка сохранена</summary><p class="mt-1 text-subtle">Модель использует сводку и последние сообщения. История чата ниже не сокращена.</p>${contextHtml}</details>\n${historyHtml}`;
}
