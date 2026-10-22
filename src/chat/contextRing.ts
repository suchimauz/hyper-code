/**
 * Draw the context ring from the latest model usage or successful compaction estimate.
 *
 * Grey up to 70 %, amber to 90 %, red beyond; the percentage sits inside the ring and the used/window
 * total ("253k/1m") to its left. The tooltip gives the exact numbers and a click opens the compact form. Percentages above 100 remain
 * readable while the visual ring stops at full. Without a known window it shows tokens. Empty until usage is known.
 * Tool-only responses update usage too; completed compaction supersedes older provider counts with a labeled estimate.
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
        sql: "SELECT payload FROM events e WHERE agent_id = ? AND (type IN ('context_usage', 'compaction_completed') OR (type = 'assistant' AND NOT EXISTS (SELECT 1 FROM events newer WHERE newer.agent_id = e.agent_id AND newer.type IN ('context_usage', 'compaction_completed')))) ORDER BY idx DESC LIMIT 1",
        params: [id],
    })) as any[])[0];
    let event: { type?: string; tokensAfter?: number; usage?: { prompt_tokens?: number; completion_tokens?: number } } | null = null;
    try { event = last ? JSON.parse(last.payload) : null; } catch { event = null; }
    const estimated = event?.type === 'compaction_completed';
    const usage = event?.usage;
    const used = estimated ? Number(event?.tokensAfter) : usage ? Number(usage.prompt_tokens) + Number(usage.completion_tokens) : NaN;
    if (!Number.isFinite(used) || used <= 0) return "";
    const window = Number((await ctx.fns.compaction.contextWindow({ model: String(agent.model) })) ?? 0);
    const k = (n: number) => n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}m` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
    const share = window > 0 ? used / window : 0;
    const percent = Math.round(share * 100);
    const colour = share >= 0.9 ? "var(--color-error)" : share >= 0.7 ? "var(--color-warning)" : "var(--color-subtle)";
    const label = estimated ? 'Context estimate after compaction' : 'Context';
    const title = window > 0 ? `${label} ${k(used)} of ${k(window)} · ${percent}% — click to compact` : `${label} ${k(used)} tokens — click to compact`;
    const face = window > 0
        ? `<span data-context-total class="font-mono text-3xs text-faint" aria-hidden="true">${k(used)}/${k(window)}</span><span class="chat-ring chat-ring-pct" style="--p:${(Math.min(1, share) * 100).toFixed(1)}%;--c:${colour}" aria-hidden="true"><span data-context-pct style="color:${colour}" aria-hidden="true">${percent}%</span></span>`
        : `<span class="font-mono text-3xs">${k(used)}</span>`;
    return ctx.fns.ui.popup({
        method: "chat.compactPopup",
        params: { agentId: id },
        html: face,
        attrs: `data-context-meter class="flex h-8 min-w-8 items-center justify-center gap-1 rounded-full px-1 text-faint hover:bg-base-200" title="${ctx.fns.procs.ui.escape({ text: title })}" aria-label="${ctx.fns.procs.ui.escape({ text: title })}"`,
    });
}
