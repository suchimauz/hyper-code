/**
 * Renders the MiniMax M Plan request settings form
 *
 * Draw the MiniMax M Plan admission tier next to the plan account and after saving. Output budgets are selected by the provider, not exposed as an application setting.
 * @param opts.serviceTier Current admission tier.
 */
export default function (ctx: Context, _session: Session | null, opts: {
    /** Current admission tier: "standard" or "priority". */
    serviceTier: string;
}): string {
    const esc = (x: any) => ctx.fns.procs.ui.escape({ text: String(x ?? "") });
    const tier = opts.serviceTier === "priority" ? "priority" : "standard";
    const item = (label: string, hint: string, control: string) => `<div class="flex items-center justify-between gap-3"><div class="min-w-0"><div class="text-2xs text-muted">${esc(label)}</div><div class="text-micro text-faint">${esc(hint)}</div></div>${control}</div>`;
    const tierSelect = `<select name="minimaxCodingServiceTier" aria-label="MiniMax admission tier" class="rounded border border-ui-border bg-base-100 px-2 py-1 text-2xs font-mono"><option value="standard"${tier === "priority" ? "" : " selected"}>standard</option><option value="priority"${tier === "priority" ? " selected" : ""}>priority</option></select>`;
    return `<form class="llm-minimax-settings mt-2 space-y-2 rounded-lg border border-ui-border bg-base-200/40 p-3" hx-post="/llms/minimax/settings" hx-target="closest .llm-minimax-settings" hx-swap="outerHTML">${item("Admission tier", "standard queues normally; priority is admitted first", tierSelect)}<div class="flex justify-end">${ctx.fns.procs.ui.button({ action: "save-minimax-settings", label: "Save", type: "submit", size: "xs" })}</div></form>`;
}
