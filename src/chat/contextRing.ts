/**
 * Render the next-request context estimate with checkpoint fallback details in its tooltip.
 *
 * Use in chat headers: the main total is always an estimate of the upcoming payload, never the
 * last provider usage. The tooltip explains fallback reasons and reports successful usage only
 * as secondary history. Text percentages may exceed 100%; only the ring fill is capped.
 * A zero or invalid estimate renders nothing; unknown capacity shows only the estimated tokens.
 * Unavailable model routes show an explicit unavailable marker instead of breaking the chat or reusing stale counts.
 * @param opts.agentId Agent whose next request is measured.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Agent whose next request is measured. */
    agentId: string;
}): Promise<string> {
    const id = String(opts.agentId ?? "");
    const budget = await ctx.fns.agent.contextBudget({ agentId: id }).catch(() => null);
    if (!budget) return '<span data-context-unavailable class="font-mono text-3xs text-faint" title="Оценка контекста следующего запроса недоступна" aria-label="Оценка контекста следующего запроса недоступна">—</span>';
    const used = budget.estimatedTokens;
    if (!Number.isFinite(used) || used <= 0) return "";
    const window = budget.contextWindow ?? 0;
    const k = (n: number) => n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}m` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
    const share = window > 0 ? used / window : 0;
    const percent = Math.round(share * 100);
    const colour = share >= 0.9 ? "var(--color-error)" : share >= 0.7 ? "var(--color-warning)" : "var(--color-subtle)";
    const reasons = {
        missing_generation: 'нет поколения сжатого контекста',
        missing_checkpoint: 'нет сохранённого checkpoint',
        incompatible_checkpoint: 'checkpoint несовместим с текущим запросом',
        invalid_boundary: 'некорректная граница сжатой истории',
    };
    const fallback = budget.fallback !== null ? ` Сжатый снимок не используется: ${reasons[budget.fallback]}.` : '';
    const reported = budget.lastReportedTokens;
    const history = reported !== null && Number.isFinite(reported) && reported >= 0
        ? ` Last successful request: ${reported} tokens (not the next-request estimate).` : '';
    const title = `Next request estimate ${used} tokens${window > 0 ? ` of ${window} · ${percent}%` : ''} — click to compact.${fallback}${history}`;
    const face = window > 0
        ? `<span data-context-total class="font-mono text-3xs text-faint" aria-hidden="true">${k(used)}/${k(window)}</span><span class="chat-ring" style="--p:${(Math.min(1, share) * 100).toFixed(1)}%;--c:${colour}" aria-hidden="true"></span>`
        : `<span class="font-mono text-3xs" aria-hidden="true">${k(used)}</span>`;
    return ctx.fns.ui.popup({
        method: "chat.compactPopup",
        params: { agentId: id },
        html: face,
        attrs: `data-context-meter class="flex h-8 min-w-8 items-center justify-center gap-1 rounded-full px-1 text-faint hover:bg-base-200" title="${ctx.fns.procs.ui.escape({ text: title })}" aria-label="${ctx.fns.procs.ui.escape({ text: title })}"`,
    });
}
