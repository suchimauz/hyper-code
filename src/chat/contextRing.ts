/**
 * Draws the context ring of a chat: how full the model's context window was on the last request.
 *
 * Grey up to 70 %, amber to 90 %, red beyond; mobile also shows the percentage without opening settings.
 * The tooltip gives the exact numbers and a click opens the compact form. Percentages above 100 remain
 * readable while the visual ring stops at full. Without a known window it shows tokens. Empty before the first answer.
 * @param opts.agentId Agent whose context is measured.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Agent whose context is measured. */
    agentId: string;
}): Promise<string> {
    const id = String(opts.agentId ?? "");
    const agent = (ctx.state as any).agent?.[id] ?? await ctx.fns.session.load({ id });
    if (!agent) return "";
    const last = ((await ctx.fns.procs.db.select({
        sql: "SELECT payload FROM events WHERE agent_id = ? AND type = 'assistant' ORDER BY idx DESC LIMIT 1",
        params: [id],
    })) as any[])[0];
    let usage: any = null;
    try { usage = last ? JSON.parse(last.payload).usage ?? null : null; } catch { usage = null; }
    const used = usage ? Number(usage.prompt_tokens ?? 0) + Number(usage.completion_tokens ?? 0) : 0;
    if (!used) return "";
    const window = Number((await ctx.fns.compaction.contextWindow({ model: String(agent.model) })) ?? 0);
    const k = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
    const share = window > 0 ? used / window : 0;
    const percent = Math.round(share * 100);
    const colour = share >= 0.9 ? "var(--color-error)" : share >= 0.7 ? "var(--color-warning)" : "var(--color-subtle)";
    const title = window > 0 ? `Context ${k(used)} of ${k(window)} · ${percent}% — click to compact` : `Context ${k(used)} tokens — click to compact`;
    const face = window > 0
        ? `<span class="chat-ring" style="--p:${(Math.min(1, share) * 100).toFixed(1)}%;--c:${colour}" aria-hidden="true"></span><span data-context-percent style="color:${colour}" aria-hidden="true">${percent}%</span>`
        : `<span class="font-mono text-3xs">${k(used)}</span>`;
    return ctx.fns.ui.popup({
        method: "chat.compactPopup",
        params: { agentId: id },
        html: face,
        attrs: `data-context-meter class="flex h-8 min-w-8 items-center justify-center gap-1 rounded-full px-1 text-faint hover:bg-base-200" title="${ctx.fns.procs.ui.escape({ text: title })}" aria-label="${ctx.fns.procs.ui.escape({ text: title })}"`,
    });
}
