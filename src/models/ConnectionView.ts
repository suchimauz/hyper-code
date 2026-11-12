/** Secret-free connection projection for clients: secret fields report only whether a value is stored. */
export type ConnectionView = {
    /** System-generated UUID. */
    id: string;
    /** Registered provider id. */
    provider: string;
    /** False when the provider declaration is no longer registered. */
    providerRegistered: boolean;
    /** Non-unique display name, 1–100 characters. */
    accountName: string;
    /** Non-secret configuration; manual model ids are stored under `models`. */
    config: types.models.ResolvedConnection["config"];
    /** Secret field key → whether a value is stored. Never values or refs. */
    secrets: Record<string, boolean>;
    transport: types.models.TransportSpec;
    enabled: boolean;
    /** Unix epoch milliseconds. */
    createdAt: number;
    /** Unix epoch milliseconds; changes on every update. */
    updatedAt: number;
};
