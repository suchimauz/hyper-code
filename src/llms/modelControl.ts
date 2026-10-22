/**
 * Render a per-model enable or disable control for LLM Connections
 *
 * Show the exact model route and its current local user policy without removing catalogue entries. Returns a self-replacing POST form usable in account, API and Hyper node model lists. Disabled models can be enabled again; no inference is performed.
 * @param opts.model Provider-qualified route whose policy is edited.
 * @param opts.disabled Whether the exact model route is currently disabled by the user.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider-qualified route whose policy is edited. */
        model: string;
        /** Whether the exact model route is currently disabled by the user. */
        disabled: boolean;
    },
): string {
    const esc = (text: string) => ctx.fns.procs.ui.escape({text});
    return `<form method="POST" action="/llms/model-state" hx-post="/llms/model-state" hx-target="this" hx-swap="outerHTML" data-model-policy="${esc(opts.model)}" data-model-disabled="${opts.disabled}" class="flex max-w-full items-center gap-2 rounded bg-base-200 px-2 py-1"><input type="hidden" name="model" value="${esc(opts.model)}"><input type="hidden" name="disabled" value="${!opts.disabled}"><span class="break-all font-mono text-2xs ${opts.disabled ? 'text-faint' : ''}">${esc(opts.model)}</span>${opts.disabled ? '<span class="text-2xs text-warning">disabled</span>' : ''}<button type="submit" class="shrink-0 rounded border border-base-300 px-1.5 py-0.5 text-2xs hover:bg-base-300" aria-label="${esc((opts.disabled ? 'Enable ' : 'Disable ') + opts.model)}">${opts.disabled ? 'Enable' : 'Disable'}</button></form>`;
}
