/**
 * Render a per-model enable or disable control for LLM Connections
 *
 * Show only the model name and a compact enabled-state switch; keep the exact route in form values and the hover tooltip without removing catalogue entries. Returns a self-replacing POST form that submits on switch changes in account, API and Hyper node model lists. The switch is checked when inference is enabled; no extra disabled badge or inference request is emitted.
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
    // Separate routing metadata, preserving slashes and tags inside the model ID.
    const prefix = /^(?:(?:ssh|hyper)\/[^:]+:)*(?:[a-z][\w-]*(?:\/[\w.-]+)?:)/.exec(opts.model)?.[0] ?? '';
    const modelLabel = esc(opts.model.slice(prefix.length));
    return `<form method="POST" action="/llms/model-state" hx-post="/llms/model-state" hx-trigger="change" hx-target="this" hx-swap="outerHTML" hx-disabled-elt="find input[type=checkbox]" data-model-policy="${esc(opts.model)}" data-model-disabled="${opts.disabled}" class="flex max-w-full items-center gap-1 rounded bg-base-200 px-1.5 py-0.5"><input type="hidden" name="model" value="${esc(opts.model)}"><input type="hidden" name="disabled" value="${!opts.disabled}"><span class="break-all font-mono text-2xs text-primary${opts.disabled ? ' opacity-60' : ''}" title="${esc(opts.model)}">${modelLabel}</span><label class="llm-model-switch"><input type="checkbox" role="switch"${opts.disabled ? '' : ' checked'} aria-label="${esc((opts.disabled ? 'Enable ' : 'Disable ') + opts.model)}"><span class="llm-model-switch-track" aria-hidden="true"></span></label></form>`;
}
