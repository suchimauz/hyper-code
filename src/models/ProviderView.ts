/** Public catalogue entry: only declarative metadata, never handlers or connection data. */
export type ProviderView = {
    id: string;
    label: string;
    description?: string;
    icon?: string;
    fields: types.models.FieldSpec[];
    transports: types.models.TransportSpec["kind"][];
    actions: { name: string; label: string }[];
};
