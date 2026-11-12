/** Provider registry and connection health cache owned by the models namespace. */
export type State = {
    providers?: Record<string, {
        owner: string;
        module: string;
        rel: string;
        definition: types.models.ProviderDefinition;
    }>;
    /** `<connection id>:<Bun.hash(id + updated_at)>:<test|usage>` key; 60 s expiry with in-flight de-duplication. */
    health?: Record<string, {
        expiresAt: number;
        result?: types.models.UsageReport | types.models.TestResult;
        pending?: Promise<types.models.UsageReport | types.models.TestResult>;
    }>;
    /** In-flight Codex token refresh per connection id; de-duplicates concurrent refreshes. */
    codexRefresh?: Record<string, Promise<string>>;
    /** Process-local Codex device-code login flows by connection id; lost on restart. */
    loginFlows?: Record<string, types.models.LoginFlow>;
};
