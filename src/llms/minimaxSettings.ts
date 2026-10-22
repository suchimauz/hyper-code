/**
 * Renders the MiniMax M Plan request settings form
 *
 * Draw the two MiniMax M Plan request settings next to the plan account: the admission tier and the output budget. Thinking tokens count against the output budget, so a small value leaves no room for the visible answer. Use wherever the plan account is shown, and as the response of the save route.
 * @param opts.serviceTier Current admission tier.
 * @param opts.maxTokens Current output budget in tokens.
 */
export default function (ctx: Context, _session: Session | null, opts: {
    /** Current admission tier: "standard" or "priority". */
    serviceTier: string;
    /** Current output budget in tokens. */
    maxTokens: number;
}): string {
    const esc = (x: any) => ctx.fns.procs.ui.escape({ text: String(x ?? "") });
    const tier = opts.serviceTier === "priority" ? "priority" : "standard";
    const maxTokens = Number(opts.maxTokens) || 16384;
    const item = (label: string, hint: string, control: string) => `<div class="flex items-center justify-between gap-3"><div class="min-w-0"><div class="text-2xs text-muted">${esc(label)}</div><div class="text-micro text-faint">${esc(hint)}</div></div>${control}</div>`;
    const tierSelect = `<select name="minimaxCodingServiceTier" aria-label="MiniMax admission tier" class="rounded border border-ui-border bg-base-100 px-2 py-1 text-2xs font-mono"><option value="standard"${tier === "priority" ? "" : " selected"}>standard</option><option value="priority"${tier === "priority" ? " selected" : ""}>priority</option></select>`;
    const tokensInput = `<input name="minimaxCodingMaxTokens" aria-label="MiniMax max output tokens" value="${esc(maxTokens)}" min="2048" max="131072" step="1024" type="number" class="w-28 rounded border border-ui-border bg-base-100 px-2 py-1 text-2xs font-mono">`;
    return `<form class="llm-minimax-settings mt-2 space-y-2 rounded-lg border border-ui-border bg-base-200/40 p-3" hx-post="/llms/minimax/settings" hx-target="closest .llm-minimax-settings" hx-swap="outerHTML">${item("Admission tier", "standard queues normally; priority is admitted first", tierSelect)}${item("Max output tokens", "Thinking tokens count against this budget", tokensInput)}<div class="flex justify-end">${ctx.fns.procs.ui.button({ action: "save-minimax-settings", label: "Save", type: "submit", size: "xs" })}</div></form>`;
}
