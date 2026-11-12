/** SDK v0 backend contract for a mounted $modelProvider_<id>.ts declaration. */
export type ProviderDefinition = {
    /** Lowercase kebab-case id matching the declaration filename. */
    id: string;
    label: string;
    description?: string;
    /** Lucide icon name or data URL. */
    icon?: string;
    fields: types.models.FieldSpec[];
    transports: types.models.TransportSpec["kind"][];
    /** Test this connection only; use conn.fetch and never log conn.secret results. */
    test: (ctx: Context, conn: types.models.ResolvedConnection) => Promise<types.models.TestResult>;
    listModels?: (ctx: Context, conn: types.models.ResolvedConnection) => Promise<types.models.ModelInfo[]>;
    usage?: (ctx: Context, conn: types.models.ResolvedConnection) => Promise<types.models.UsageReport>;
    /** Additional provider-specific validation after core field validation. Throw to reject. */
    validate?: (ctx: Context, config: types.models.ResolvedConnection["config"]) => void | Promise<void>;
    /** Optional streaming inference; called only through models.stream after the enabled checks. Send traffic only through conn.fetch. */
    stream?: (ctx: Context, conn: types.models.ResolvedConnection, req: types.models.StreamRequest) => Promise<types.models.StreamResult>;
    /** Optional native transcript compaction; called only through models.compact after the enabled checks. */
    compact?: (ctx: Context, conn: types.models.ResolvedConnection, req: types.models.CompactRequest) => Promise<types.models.CompactResult>;
    /** Additive SDK features this provider opts into; omitted means none. */
    capabilities?: {
        /** Accepts and returns run-scoped ProviderState. */
        continuationState?: boolean;
        /** Accepts CheckpointEntry input and gets portable checkpoints wrapped around compact results. */
        checkpoints?: boolean;
        /** Receives SDK-normalized reasoning in StreamRequest.reasoning; requires model metadata or reasoningProfile. */
        reasoning?: boolean;
    };
    /** Documented versioned reasoning profile used when model discovery metadata has none; return null when no profile applies to the model. */
    reasoningProfile?: (ctx: Context, model: string) => types.models.ReasoningCapabilities | null;
    actions?: Record<string, {
        label: string;
        /** Provider-owned login/logout/etc. Return only safe JSON, never credentials. */
        run: (ctx: Context, conn: types.models.ResolvedConnection, input: types.models.ActionValue) => Promise<types.models.ActionValue>;
    }>;
};
