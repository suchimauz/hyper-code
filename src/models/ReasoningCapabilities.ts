/** Validated reasoning levels one provider model supports, from discovery metadata or a documented SDK profile. */
export type ReasoningCapabilities = {
    /** Supported levels; nonempty, unique, SDK enumeration only. */
    supported: types.models.ReasoningLevel[];
    /** Level applied for an omitted or auto preference; must be one of supported. */
    default: types.models.ReasoningLevel;
    /** Where the capabilities came from: provider model discovery or a versioned SDK profile. */
    source: "metadata" | "profile";
    /** Versioned profile id when source is profile, e.g. codex-2026-07. */
    profile?: string;
};
