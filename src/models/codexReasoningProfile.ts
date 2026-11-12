/**
 * Return the documented Codex reasoning profile for a model
 *
 * Versioned SDK profile codex-2026-07, used only when Codex model discovery reports no reasoning levels: gpt-6* supports low..xhigh; gpt-5*, gpt-5.x-codex and codex-* models support off..high, plus xhigh for gpt-5.2+ and codex-max; default medium. Returns null for any other model so inference fails CAPABILITY_UNAVAILABLE instead of guessing.
 * @param opts.model Codex model id.
 */
export default function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Codex model id. */
        model: string;
    },
): types.models.ReasoningCapabilities | null {
    const id = opts.model;
    const profile = "codex-2026-07";
    if (/^gpt-6(?:[.-]|$)/.test(id)) return { supported: ["low", "medium", "high", "xhigh"], default: "medium", source: "profile", profile };
    if (/^(?:gpt-5(?:[.-]|$)|codex-)/.test(id)) {
        const xhigh = /^gpt-5\.(?:[2-9]|\d{2,})|codex-max/.test(id);
        return { supported: ["off", "minimal", "low", "medium", "high", ...(xhigh ? ["xhigh" as const] : [])], default: "medium", source: "profile", profile };
    }
    return null;
}
