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
    actions?: Record<string, {
        label: string;
        /** Provider-owned login/logout/etc. Return only safe JSON, never credentials. */
        run: (ctx: Context, conn: types.models.ResolvedConnection, input: types.models.ActionValue) => Promise<types.models.ActionValue>;
    }>;
};
