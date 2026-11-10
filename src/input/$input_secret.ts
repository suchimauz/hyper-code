// A password, API key or one-time code typed straight into encrypted secret
// storage. The value passes through submit once, on its way to secrets.set; the
// row, the transcript and the agent only ever see the secret:// reference.

export const hint = 'a password, API key or one-time code, saved straight into encrypted secret storage — spec `{ saveAs: "secret://ns/name", mode?: "password" | "otp" | "text", maxlength? }`; you get back only the reference, use it via bash({ secrets: { VAR: ref } }) or secrets.get';

const MODES = ["password", "otp", "text"] as const;

const batch: types.input.BatchCodec = {
    version: 1,
    normalizeSpec({ spec: s }) {
        if (Object.keys(s).some(k => !["saveAs", "mode", "maxlength"].includes(k))) throw new Error("secret: unknown spec field");
        if (typeof s.saveAs !== "string" || !/^secret:\/\/([A-Za-z0-9][\w.-]*)\/([A-Za-z0-9][\w.:@-]*)$/.test(s.saveAs)) throw new Error("secret: invalid reference");
        if (s.mode !== undefined && !MODES.includes(s.mode as typeof MODES[number])) throw new Error("secret: invalid mode");
        const mode = s.mode ?? "password";
        const maxlength = s.maxlength ?? (mode === "otp" ? 16 : 256);
        if (typeof maxlength !== "number" || !Number.isInteger(maxlength) || maxlength < 1 || maxlength > 4096) throw new Error("secret: maxlength must be 1–4096");
        return { saveAs: s.saveAs, mode, maxlength };
    },
    validate({ spec: s, values }) {
        const fail = (): types.input.BatchValidation => ({ ok: false, error: { code: "invalid_secret", message: "Enter a valid value within the field length limit" } });
        if (Object.keys(values).some(k => k !== "value") || typeof values.value !== "string") return fail();
        let value = s.mode === "password" ? values.value : values.value.trim();
        if (!value || value.length > Number(s.maxlength)) return fail();
        if (s.mode === "otp") {
            if (!/^[0-9 -]{3,16}$/.test(value)) return fail();
            value = value.replace(/[ -]/g, "");
            if (value.length < 3) return fail();
        }
        return { ok: true, values: { value }, result: { ref: s.saveAs }, summary: `Saved as ${s.saveAs}` };
    },
    projectSpec({ spec: s }) { return { saveAs: s.saveAs, mode: s.mode, maxlength: s.maxlength }; },
    projectDraft() { return {}; },
};

export default {
    batch,
    icon: "key",
    prepare(ctx: Context, opts: { spec: Record<string, any> }) {
        const { namespace, name } = ctx.fns.secrets.parseRef({ ref: String(opts.spec.saveAs ?? "") });
        const mode = MODES.includes(opts.spec.mode) ? opts.spec.mode : "password";
        const maxlength = Math.max(1, Math.min(Number(opts.spec.maxlength ?? (mode === "otp" ? 16 : 256)) || 256, 4096));
        return { saveAs: `secret://${namespace}/${name}`, mode, maxlength };
    },
    open(ctx: Context, opts: { input: types.input.Row }) {
        const esc = (v: unknown) => ctx.fns.procs.ui.escape({ text: v });
        const s = opts.input.spec;
        const otp = s.mode === "otp";
        const attrs = otp ? 'inputmode="numeric" autocomplete="one-time-code" placeholder="123456"'
            : s.mode === "password" ? 'autocomplete="new-password" placeholder="••••••••"' : 'autocomplete="off"';
        return `<input name="value" type="${s.mode === "text" ? "text" : "password"}" required maxlength="${Number(s.maxlength)}" ${attrs} `
            + `class="input input-bordered input-sm w-full bg-base-100 ${otp ? "font-mono tracking-[0.3em]" : ""}" aria-label="${esc(opts.input.title)}">`
            + `<p class="font-mono text-3xs text-faint">→ ${esc(s.saveAs)} · the value is hidden from both the agent and chat history</p>`;
    },
    async submit(ctx: Context, opts: { input: types.input.Row; values: types.input.FormValues }) {
        const s = opts.input.spec;
        let value = String(opts.values.value ?? "");
        if (s.mode !== "password") value = value.trim();
        if (!value) throw new Error("Enter a value");
        if (s.mode === "otp") {
            if (!/^[0-9 -]{3,16}$/.test(value)) throw new Error("Enter a numeric code");
            value = value.replace(/[ -]/g, "");
        }
        if (value.length > Number(s.maxlength)) throw new Error(`No more than ${s.maxlength} characters`);
        await ctx.fns.secrets.set({ ref: s.saveAs, value, source: "input" });
        return { result: { ref: s.saveAs }, summary: `secret ${s.saveAs} is stored — use it via bash({ secrets: { VAR: "${s.saveAs}" } })` };
    },
    done(ctx: Context, opts: { input: types.input.Row }) {
        return `<p class="text-2xs text-muted"><i class="ph ph-lock-simple" aria-hidden="true"></i> saved as <code>${ctx.fns.procs.ui.escape({ text: opts.input.result?.ref ?? opts.input.spec.saveAs })}</code></p>`;
    },
} satisfies types.input.Kind;
