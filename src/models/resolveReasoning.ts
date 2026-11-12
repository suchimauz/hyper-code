/**
 * Normalize a reasoning preference against validated model capabilities
 *
 * SDK reasoning normalization used by models.stream for providers declaring capabilities.reasoning. Uses discovery metadata when present, otherwise the provider's documented profile. Omitted or auto resolves to the default; a supported level is kept; otherwise the nearest supported level at or below the request, else the lowest supported level above it. Fails INVALID_INPUT for a preference outside the SDK enumeration or invalid metadata (empty, duplicate or unknown levels, unsupported default) and CAPABILITY_UNAVAILABLE when neither metadata nor a profile applies — never guesses or sends auto.
 * @param opts.model Provider-native model id, used in diagnostics.
 * @param opts.preference Caller reasoning preference; omitted means auto.
 * @param opts.metadata Reasoning capabilities reported by model discovery, when known.
 * @param opts.profile Documented SDK profile for this model, or null when none applies.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Provider-native model id, used in diagnostics. */
        model: string;
        /** Caller reasoning preference; omitted means auto. */
        preference?: string;
        /** Reasoning capabilities reported by model discovery, when known. */
        metadata?: { supported: unknown; default: unknown } | null;
        /** Documented SDK profile for this model, or null when none applies. */
        profile?: types.models.ReasoningCapabilities | null;
    },
): types.models.ReasoningResolution {
    const order: types.models.ReasoningLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
    const invalid = (message: string) => ctx.fns.models.failure({ message, status: 400, info: { code: "INVALID_INPUT", classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true } });
    const requested = (opts.preference ?? "auto") as types.models.ReasoningLevel | "auto";
    if (requested !== "auto" && !order.includes(requested)) throw invalid(`Unknown reasoning preference ${JSON.stringify(String(opts.preference).slice(0, 40))}`);
    const raw = opts.metadata ?? opts.profile ?? null;
    if (!raw) throw ctx.fns.models.failure({ message: `No reasoning capabilities are known for model ${opts.model}`, status: 400, info: { code: "CAPABILITY_UNAVAILABLE", classification: "capability_unavailable", acceptance: "none", retryable: false, replaySafe: true } });
    const source: types.models.ReasoningCapabilities["source"] = opts.metadata ? "metadata" : "profile";
    const supported = raw.supported;
    if (!Array.isArray(supported) || !supported.length || supported.some(l => !order.includes(l)) || new Set(supported).size !== supported.length)
        throw invalid(`Invalid reasoning ${source} for model ${opts.model}: supported levels must be a nonempty unique SDK enumeration`);
    const levels = supported as types.models.ReasoningLevel[];
    if (!levels.includes(raw.default as types.models.ReasoningLevel)) throw invalid(`Invalid reasoning ${source} for model ${opts.model}: default is not supported`);
    const base = { source, ...(source === "profile" && opts.profile?.profile ? { profile: opts.profile.profile } : {}) };
    if (requested === "auto") return { requested, applied: raw.default as types.models.ReasoningLevel, fallbackReason: null, ...base };
    if (levels.includes(requested)) return { requested, applied: requested, fallbackReason: null, ...base };
    const at = order.indexOf(requested);
    const applied = order.slice(0, at).reverse().find(l => levels.includes(l)) ?? order.slice(at + 1).find(l => levels.includes(l))!;
    return { requested, applied, fallbackReason: `${requested} is unsupported by ${opts.model}; using ${applied}`, ...base };
}
