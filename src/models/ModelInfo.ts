/** Secret-free model descriptor returned by a provider or manual configuration. */
export type ModelInfo = {
    /** Provider-native model identifier. */
    id: string;
    label?: string;
    description?: string;
    contextWindow?: number;
    maxOutputTokens?: number;
    /** Set by models.listModels: true when the owner disabled this model on the connection. */
    disabled?: boolean;
};
