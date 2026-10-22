/**
 * Renders the coding-plan egress instance picker form
 *
 * Draw one select next to a Z.ai or MiniMax coding-plan account: "local" keeps calls on this machine, an SSH instance name carries them through that host's network. Use wherever the plan account is shown, and as the response of the save route.
 * @param opts.provider Coding plan provider the picker belongs to.
 * @param opts.instance Currently selected instance name, or null for local.
 * @param opts.instances Trusted SSH instance names available for egress.
 */
export default function (ctx: Context, _session: Session | null, opts: {
    /** Coding plan provider the picker belongs to. */
    provider: "zai-coding" | "minimax-coding";
    /** Currently selected instance name, or null for local. */
    instance: string | null;
    /** Trusted SSH instance names available for egress. */
    instances: string[];
}): string {
    const esc = (x: any) => ctx.fns.procs.ui.escape({ text: String(x ?? "") });
    const provider = opts.provider === "minimax-coding" ? "minimax-coding" : "zai-coding";
    const current = opts.instance && opts.instances.includes(opts.instance) ? opts.instance : "local";
    const options = ["local", ...opts.instances].map((name) =>
        `<option value="${esc(name)}"${name === current ? " selected" : ""}>${esc(name === "local" ? "local · this machine" : name)}</option>`).join("");
    const select = `<select name="instance" aria-label="${esc(provider)} egress instance" class="rounded border border-ui-border bg-base-100 px-2 py-1 text-2xs font-mono"${opts.instances.length ? "" : " disabled"}>${options}</select>`;
    const hint = opts.instances.length
        ? "local keeps calls on this machine; an SSH instance carries them through its network"
        : "no trusted SSH instances yet — add one on the SSH instances page";
    return `<form class="llm-plan-instance mt-2 space-y-2 rounded-lg border border-ui-border bg-base-200/40 p-3" hx-post="/llms/plan/instance" hx-target="closest .llm-plan-instance" hx-swap="outerHTML"><input type="hidden" name="provider" value="${esc(provider)}"><div class="flex items-center justify-between gap-3"><div class="min-w-0"><div class="text-2xs text-muted">Egress instance</div><div class="text-micro text-faint">${esc(hint)}</div></div>${select}</div><div class="flex justify-end">${ctx.fns.procs.ui.button({ action: "save-plan-instance", label: "Save", type: "submit", size: "xs" })}</div></form>`;
}
