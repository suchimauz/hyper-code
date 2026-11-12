/** Provider registry and connection health cache owned by the models namespace. */
export type State = {
    providers?: Record<string, {
        owner: string;
        module: string;
        rel: string;
        definition: types.models.ProviderDefinition;
    }>;
    /** Bun.hash(connection id + updated_at) key; expiry and pending work support later health APIs. */
    health?: Record<string, {
        expiresAt: number;
        result?: types.models.UsageReport;
        pending?: Promise<types.models.UsageReport>;
    }>;
};
