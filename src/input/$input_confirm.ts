// "Do it?" before anything outward-facing or irreversible: a message that will
// be sent, a push, a deletion, a payment. The spec carries the exact preview so
// the person approves what will happen, not a paraphrase of it.

export const hint = 'yes/no before an outward or irreversible action (send, push, delete, pay, publish) — spec `{ details?: markdown preview of exactly what will happen, confirmLabel?, declineLabel?, danger?: boolean }`; result `{ confirmed: boolean, comment? }`. Act only on confirmed: true';

const batch: types.input.BatchCodec = {
    version: 1,
    normalizeSpec({ spec: s }) {
        if (Object.keys(s).some(k => !["details", "confirmLabel", "declineLabel", "danger"].includes(k))) throw new Error("confirm: unknown spec field");
        if ([s.details, s.confirmLabel, s.declineLabel].some(v => v !== undefined && typeof v !== "string") || (s.danger !== undefined && typeof s.danger !== "boolean")) throw new Error("confirm: invalid spec");
        return { details: s.details ?? "", confirmLabel: s.confirmLabel ?? "Confirm", declineLabel: s.declineLabel ?? "Decline", danger: s.danger === true };
    },
    validate({ values }) {
        if (Object.keys(values).some(k => !["decision", "comment"].includes(k)) || !["yes", "no"].includes(values.decision as string) || (values.comment !== undefined && typeof values.comment !== "string") || (typeof values.comment === "string" && values.comment.length > 2000)) return { ok: false, error: { code: "invalid_confirmation", message: "Choose yes or no and an optional short comment" } };
        const comment = typeof values.comment === "string" ? values.comment.trim() : "";
        const confirmed = values.decision === "yes";
        return { ok: true, values: { decision: confirmed ? "yes" : "no", ...(comment ? { comment } : {}) }, result: { confirmed, ...(comment ? { comment } : {}) }, summary: `${confirmed ? "Confirmed" : "Declined"}${comment ? `: ${comment}` : ""}` };
    },
    projectSpec({ spec }) { return structuredClone(spec); },
    projectDraft({ values }) { return { ...(values.decision !== undefined ? { decision: values.decision } : {}), ...(values.comment !== undefined ? { comment: values.comment } : {}) }; },
};

export default {
    batch,
    icon: "seal-question",
    cancel: false,
    prepare(_ctx: Context, opts: { spec: Record<string, any> }) {
        return {
            details: String(opts.spec.details ?? ""),
            confirmLabel: String(opts.spec.confirmLabel ?? "Confirm"),
            declineLabel: String(opts.spec.declineLabel ?? "Decline"),
            danger: opts.spec.danger === true,
        };
    },
    async open(ctx: Context, opts: { input: types.input.Row }) {
        const details = opts.input.spec.details
            ? `<div class="max-h-80 overflow-auto rounded-md border border-ui-border bg-base-200/40 px-3 py-2 prose prose-sm max-w-none text-base-content prose-p:my-1">${await ctx.fns.markdown.render({ source: opts.input.spec.details })}</div>`
            : "";
        return details + `<input name="comment" maxlength="2000" placeholder="comment (optional)" class="input input-bordered input-sm w-full bg-base-100">`;
    },
    buttons(ctx: Context, opts: { input: types.input.Row }) {
        const s = opts.input.spec;
        return ctx.fns.procs.ui.button({ action: "input-decline", label: s.declineLabel, type: "submit", tone: "ghost", size: "sm", name: "decision", value: "no" })
            + ctx.fns.procs.ui.button({ action: "input-confirm", label: s.confirmLabel, type: "submit", tone: s.danger ? "danger" : "primary", size: "sm", name: "decision", value: "yes" });
    },
    submit(_ctx: Context, opts: { input: types.input.Row; values: types.input.FormValues }) {
        const decision = String(opts.values.decision ?? "");
        if (decision !== "yes" && decision !== "no") throw new Error("Click one of the buttons");
        const comment = String(opts.values.comment ?? "").trim();
        const confirmed = decision === "yes";
        return { result: { confirmed, ...(comment ? { comment } : {}) }, summary: (confirmed ? "confirmed" : "declined") + (comment ? ` — ${comment}` : "") };
    },
    done(ctx: Context, opts: { input: types.input.Row }) {
        const r = opts.input.result ?? {};
        const esc = (v: unknown) => ctx.fns.procs.ui.escape({ text: v });
        return `<p class="text-sm">${r.confirmed ? '<i class="ph ph-check-circle text-success" aria-hidden="true"></i> Confirmed' : '<i class="ph ph-x-circle text-error" aria-hidden="true"></i> Declined'}</p>`
            + (r.comment ? `<p class="mt-1 text-2xs text-muted">«${esc(r.comment)}»</p>` : "");
    },
} satisfies types.input.Kind;
