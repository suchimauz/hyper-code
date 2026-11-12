/** Secret-free model descriptor returned by a provider or manual configuration. */
export type ModelInfo = {
    /** Provider-native model identifier. */
    id: string;
    label?: string;
    description?: string;
    contextWindow?: number;
    maxOutputTokens?: number;
    /** Provider-reported reasoning levels and default, when discovery supplies them. */
    reasoning?: { supported: types.models.ReasoningLevel[]; default: types.models.ReasoningLevel };
    /** Set by models.listModels: true when the owner disabled this model on the connection. */
    disabled?: boolean;
};
